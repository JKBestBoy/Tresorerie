import { openDB, type IDBPDatabase } from 'idb'
import type { Plan } from './domain/types'

const DB_NAME = 'tresorerie'
const STORE = 'plan'
const KEY = 'current'

/** Copie locale (cache hors ligne) de la dernière version enregistrée. */
export interface LocalRecord {
  plan: Plan
  /** Version en ligne sur laquelle cette copie est basée (null = jamais synchronisée) */
  remoteVersion: string | null
  /** Enregistrée localement mais pas encore envoyée en ligne */
  pendingSync: boolean
}

let dbPromise: Promise<IDBPDatabase> | null = null
function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE)
    },
  })
  return dbPromise
}

export async function loadLocal(): Promise<LocalRecord | null> {
  const raw = await (await db()).get(STORE, KEY)
  if (!raw) return null
  // Ancien format (étape 2) : le plan était stocké directement
  if ('schemaVersion' in raw) return { plan: raw as Plan, remoteVersion: null, pendingSync: true }
  return raw as LocalRecord
}

export async function saveLocal(rec: LocalRecord): Promise<void> {
  await (await db()).put(STORE, rec, KEY)
}

export async function clearLocal(): Promise<void> {
  await (await db()).delete(STORE, KEY)
}

/** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* non supporté : sans conséquence */
  }
}
