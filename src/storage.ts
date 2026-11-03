import { openDB, type IDBPDatabase } from 'idb'
import type { Plan } from './domain/types'

const DB_NAME = 'tresorerie'
const STORE = 'plan'
const KEY = 'current'

let dbPromise: Promise<IDBPDatabase> | null = null
function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE)
    },
  })
  return dbPromise
}

export async function loadPlan(): Promise<Plan | null> {
  const plan = (await (await db()).get(STORE, KEY)) as Plan | undefined
  return plan ?? null
}

export async function savePlan(plan: Plan): Promise<void> {
  await (await db()).put(STORE, plan, KEY)
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
