import { EventEmitter } from "events"

const g = globalThis as unknown as { _caseEmitter?: EventEmitter }
if (!g._caseEmitter) {
  g._caseEmitter = new EventEmitter()
  g._caseEmitter.setMaxListeners(200)
}
const caseEmitter = g._caseEmitter as EventEmitter
export default caseEmitter
