import {randomInt} from 'node:crypto'

export function normalize(value) {
  return String(value ?? '').normalize('NFC').toLocaleLowerCase('es')
    .normalize('NFD').replace(/[\u0301\u0308]/g, '').normalize('NFC').trim().replace(/\s+/g, ' ')
}

export function shuffle(values) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function selectQuestions(bank, topics, recent) {
  const pools = shuffle(topics).map(topic => shuffle(bank.filter(q => q.topic === topic))
    .sort((a,b) => (recent.get(a.id) ?? 0) - (recent.get(b.id) ?? 0)))
  const selected = []
  while (selected.length < 20 && pools.some(pool => pool.length)) {
    for (const pool of pools) {
      if (selected.length === 20) break
      if (pool.length) selected.push(pool.shift())
    }
  }
  if (selected.length !== 20) return null
  return shuffle(selected).map(question => {
    const indices = shuffle([0,1,2,3])
    return {...question, options:indices.map(i => question.options[i]), correct:indices.indexOf(question.correct)}
  })
}

export function grade(items, answers) {
  const right = items.filter((item, i) => answers[i] === item.correct).length
  const blank = items.filter((_, i) => answers[i] == null).length
  const wrong = items.length - right - blank
  const units = Math.max(0, right * 3 - wrong)
  return {right, wrong, blank, grade:Math.round(units * 100 / 6) / 100, passed:units >= 30}
}

export function validQuestion(q) {
  return q && Number.isInteger(q.topic) && q.topic >= 1 && q.topic <= 9 &&
    ['concept','prompt','explanation','reference'].every(key => typeof q[key] === 'string' && q[key].trim() && q[key].length <= 4000) &&
    Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === 'string' && o.trim() && o.length <= 1000) &&
    new Set(q.options.map(normalize)).size === 4 && [0,1,2,3].includes(q.correct) &&
    ['baja','media','alta'].includes(q.difficulty) && ['pendiente','validada'].includes(q.status) &&
    typeof q.active === 'boolean' && (!q.active || q.status === 'validada')
}
