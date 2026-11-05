// Relais de cours en direct pour l'app Ma trésorerie.
// - Titres (actions, ETF) : Yahoo Finance, convertis en euros
// - Cryptos : CoinGecko
// - Recherche d'un titre (nom, ISIN, code) ou d'une crypto
// Accessible uniquement aux utilisateurs connectés (jeton vérifié par Supabase).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; tresorerie-app/1.0)' }
const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']

type Quote = { eur: number; changePct: number | null; name?: string; currency: string; at: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function yahoo(path: string): Promise<any> {
  let last: unknown
  for (const host of YAHOO_HOSTS) {
    try {
      const r = await fetch(host + path, { headers: UA })
      if (r.ok) return await r.json()
      last = new Error(`Yahoo ${r.status}`)
    } catch (e) {
      last = e
    }
  }
  throw last
}

async function yahooQuote(symbol: string) {
  const data = await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`)
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('cours introuvable')
  let price: number = meta.regularMarketPrice
  let currency: string = meta.currency ?? 'EUR'
  // Les cotations de Londres sont en pence
  if (currency === 'GBp' || currency === 'GBX') {
    price /= 100
    currency = 'GBP'
  }
  const prev = meta.chartPreviousClose ?? meta.previousClose
  const changePct = typeof prev === 'number' && prev > 0 ? (meta.regularMarketPrice / prev - 1) * 100 : null
  return { price, currency, changePct, name: meta.longName ?? meta.shortName, time: meta.regularMarketTime }
}

async function fxToEur(currencies: Set<string>): Promise<Record<string, number>> {
  const rates: Record<string, number> = { EUR: 1 }
  await Promise.all(
    [...currencies].filter((c) => c !== 'EUR').map(async (c) => {
      try {
        rates[c] = (await yahooQuote(`${c}EUR=X`)).price
      } catch {
        /* devise non convertible : le titre sera en erreur */
      }
    }),
  )
  return rates
}

async function securities(symbols: string[]) {
  const out: Record<string, Quote> = {}
  const errors: Record<string, string> = {}
  const raw = await Promise.all(
    symbols.map(async (s) => {
      try {
        return [s, await yahooQuote(s)] as const
      } catch (e) {
        errors[`yahoo:${s}`] = String((e as Error).message ?? e)
        return null
      }
    }),
  )
  const ok = raw.filter((x): x is NonNullable<typeof x> => x !== null)
  const rates = await fxToEur(new Set(ok.map(([, q]) => q.currency)))
  for (const [s, q] of ok) {
    const rate = rates[q.currency]
    if (!rate) {
      errors[`yahoo:${s}`] = `devise ${q.currency} non convertie`
      continue
    }
    out[`yahoo:${s}`] = {
      eur: q.price * rate,
      changePct: q.changePct,
      name: q.name,
      currency: q.currency,
      at: q.time ? new Date(q.time * 1000).toISOString() : new Date().toISOString(),
    }
  }
  return { out, errors }
}

async function cryptos(ids: string[]) {
  const out: Record<string, Quote> = {}
  const errors: Record<string, string> = {}
  if (!ids.length) return { out, errors }
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=eur&include_24hr_change=true&include_last_updated_at=true`,
      { headers: UA },
    )
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`)
    const data = await r.json()
    for (const id of ids) {
      const d = data[id]
      if (d && typeof d.eur === 'number') {
        out[`coingecko:${id}`] = {
          eur: d.eur,
          changePct: d.eur_24h_change ?? null,
          currency: 'EUR',
          at: d.last_updated_at ? new Date(d.last_updated_at * 1000).toISOString() : new Date().toISOString(),
        }
      } else errors[`coingecko:${id}`] = 'crypto introuvable'
    }
  } catch (e) {
    for (const id of ids) errors[`coingecko:${id}`] = String((e as Error).message ?? e)
  }
  return { out, errors }
}

async function search(kind: string, q: string) {
  if (kind === 'crypto') {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { headers: UA })
    const d = await r.json()
    return (d.coins ?? []).slice(0, 8).map((c: any) => ({ id: c.id, label: `${c.name} (${String(c.symbol).toUpperCase()})`, detail: c.id }))
  }
  const d = await yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`)
  return (d.quotes ?? [])
    .filter((x: any) => x.symbol && x.quoteType !== 'OPTION')
    .map((x: any) => ({ id: x.symbol, label: x.longname ?? x.shortname ?? x.symbol, detail: `${x.symbol} · ${x.exchDisp ?? x.exchange ?? ''} · ${x.typeDisp ?? ''}` }))
}

/** Le jeton est déjà vérifié par Supabase ; on refuse en plus la clé publique anonyme. */
function isSignedIn(req: Request): boolean {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'authenticated'
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!isSignedIn(req)) return json({ error: 'Connexion requise' }, 401)
  try {
    const body = await req.json()
    if (body.search) {
      const q = String(body.search.q ?? '').trim().slice(0, 60)
      if (q.length < 2) return json({ results: [] })
      return json({ results: await search(body.search.kind, q) })
    }
    const syms = (Array.isArray(body.securities) ? body.securities : []).map(String).slice(0, 50)
    const ids = (Array.isArray(body.cryptos) ? body.cryptos : []).map(String).slice(0, 50)
    const [a, b] = await Promise.all([securities(syms), cryptos(ids)])
    return json({ prices: { ...a.out, ...b.out }, errors: { ...a.errors, ...b.errors }, fetchedAt: new Date().toISOString() })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400)
  }
})
