import { STORAGE_KEYS } from '../constants/storage'

const HISTORY_KEY = STORAGE_KEYS.moodHistoryLength
const DEFAULT_HISTORY_LENGTH = 30
const VALID_LENGTHS = [30, 60, 90]

export function getMoodHistoryLength() {
  const stored = Number(localStorage.getItem(HISTORY_KEY))
  return VALID_LENGTHS.includes(stored) ? stored : DEFAULT_HISTORY_LENGTH
}

export function setMoodHistoryLength(value) {
  localStorage.setItem(HISTORY_KEY, String(value))
}
