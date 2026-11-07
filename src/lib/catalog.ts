import { norm } from './format'

export const FRUITS: Record<string, { emoji: string; color: string; label: string }> = {
  tomate: { emoji: '🍅', color: 'var(--tomate)', label: 'Tomate' },
  abacate: { emoji: '🥑', color: 'var(--folha)', label: 'Abacate' },
  berinjela: { emoji: '🍆', color: 'var(--uva)', label: 'Berinjela' },
  abobora: { emoji: '🎃', color: 'var(--abobora)', label: 'Abóbora' },
  banana: { emoji: '🍌', color: 'var(--banana)', label: 'Banana' },
  limao: { emoji: '🍋', color: 'var(--limao)', label: 'Limão' },
  uva: { emoji: '🍇', color: 'var(--uva)', label: 'Uva' },
  melancia: { emoji: '🍉', color: 'var(--melancia)', label: 'Melancia' },
}

export const SECTIONS: { id: string; name: string; emoji: string; words: string[] }[] = [
  { id: 'hortifruti', name: 'Hortifrúti', emoji: '🥬', words: ['alface', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'banana', 'maca', 'laranja', 'limao', 'mamao', 'abacate', 'uva', 'melancia', 'melao', 'pepino', 'abobrinha', 'brocolis', 'couve', 'rucula', 'cheiro verde', 'salsinha', 'pimentao', 'morango', 'manga', 'abacaxi', 'chuchu', 'beterraba', 'mandioca', 'aipim', 'gengibre', 'fruta', 'verdura', 'legume', 'repolho', 'kiwi', 'pera'] },
  { id: 'acougue', name: 'Açougue e peixe', emoji: '🥩', words: ['carne', 'frango', 'peito', 'coxa', 'sobrecoxa', 'patinho', 'acem', 'alcatra', 'picanha', 'costela', 'linguica', 'bife', 'moida', 'porco', 'lombo', 'peixe', 'tilapia', 'salmao', 'camarao', 'file', 'bacon', 'calabresa'] },
  { id: 'frios', name: 'Frios e laticínios', emoji: '🧀', words: ['queijo', 'presunto', 'mussarela', 'mortadela', 'salame', 'peito de peru', 'iogurte', 'leite', 'manteiga', 'margarina', 'requeijao', 'creme de leite', 'nata', 'ovo', 'ovos', 'ricota', 'cream cheese'] },
  { id: 'padaria', name: 'Padaria', emoji: '🍞', words: ['pao', 'bisnaguinha', 'bolo', 'torrada', 'cuca', 'sonho', 'croissant', 'broa'] },
  { id: 'mercearia', name: 'Mercearia', emoji: '🥫', words: ['arroz', 'feijao', 'macarrao', 'massa', 'farinha', 'acucar', 'sal', 'oleo', 'azeite', 'cafe', 'molho', 'extrato', 'milho', 'ervilha', 'atum', 'sardinha', 'biscoito', 'bolacha', 'chocolate', 'aveia', 'granola', 'tempero', 'vinagre', 'maionese', 'ketchup', 'mostarda', 'fuba', 'achocolatado', 'gelatina', 'leite condensado', 'pipoca', 'cereal', 'mel', 'geleia'] },
  { id: 'bebidas', name: 'Bebidas', emoji: '🧃', words: ['agua', 'refrigerante', 'coca', 'guarana', 'suco', 'cerveja', 'vinho', 'cha', 'energetico', 'espumante'] },
  { id: 'limpeza', name: 'Limpeza', emoji: '🧽', words: ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'cloro', 'esponja', 'saco de lixo', 'lixo', 'alcool', 'multiuso', 'limpa', 'vassoura', 'pano', 'papel toalha', 'lava loucas'] },
  { id: 'higiene', name: 'Higiene', emoji: '🧴', words: ['shampoo', 'xampu', 'condicionador', 'sabonete', 'pasta de dente', 'creme dental', 'escova', 'fio dental', 'desodorante', 'papel higienico', 'absorvente', 'fralda', 'cotonete', 'algodao', 'protetor', 'barbeador', 'hidratante'] },
  { id: 'pets', name: 'Pets', emoji: '🐾', words: ['racao', 'areia', 'petisco', 'sache'] },
  { id: 'outros', name: 'Outros', emoji: '📦', words: [] },
]
export const sectionOf = (id: string) => SECTIONS.find(s => s.id === id) ?? SECTIONS[SECTIONS.length - 1]

export const guessSection = (name: string) => {
  const n = ` ${norm(name)} `
  let best = { id: 'outros', len: 0 }
  for (const s of SECTIONS) for (const w of s.words) {
    if (n.includes(` ${w} `) || n.includes(` ${w}s `)) if (w.length > best.len) best = { id: s.id, len: w.length }
  }
  return best.id
}

/** "2 leite", "leite 2", "arroz 5kg", "3x pão" → nome, quantidade e unidade */
export const parseItem = (raw: string) => {
  let s = raw.trim().replace(/\s+/g, ' ')
  let qty = 1
  let unit = 'un'
  const unitRe = '(kg|g|l|ml|un|pct|cx|dz|bandeja|maço|maco|lata|garrafa)'
  const head = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:x\\s*)?${unitRe}?\\s+(.+)$`, 'i'))
  const tail = s.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*${unitRe}?$`, 'i'))
  if (head) { qty = Number(head[1].replace(',', '.')); unit = (head[2] || 'un').toLowerCase(); s = head[3] }
  else if (tail) { s = tail[1]; qty = Number(tail[2].replace(',', '.')); unit = (tail[3] || 'un').toLowerCase() }
  if (unit === 'maco') unit = 'maço'
  return { name: s.charAt(0).toUpperCase() + s.slice(1), qty, unit }
}

export const qtyLabel = (qty: number, unit: string) => {
  const q = Number.isInteger(qty) ? String(qty) : String(qty).replace('.', ',')
  if (unit === 'un') return qty === 1 ? '' : `${q}×`
  return `${q} ${unit}`
}

export const MARKET_SUGGESTIONS = ['Giassi', 'Angeloni', 'Bistek', 'Fort Atacadista', 'Komprão', 'Atacadão']

export const METHODS: { id: string; label: string }[] = [
  { id: 'pix', label: 'Pix' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'boleto', label: 'Boleto' },
]

export const CARD_COLORS = ['berinjela', 'tomate', 'folha', 'abobora', 'uva', 'tinta']
export const GOAL_COLORS = ['abobora', 'folha', 'tomate', 'uva', 'banana', 'melancia']

export const CHORE_SUGGESTIONS = [
  { name: 'Levar o lixo', emoji: '🗑️', every: 2 },
  { name: 'Lavar a louça', emoji: '🍽️', every: 1 },
  { name: 'Lavar roupa', emoji: '🧺', every: 4 },
  { name: 'Limpar o banheiro', emoji: '🚿', every: 7 },
  { name: 'Aspirar a casa', emoji: '🧹', every: 7 },
  { name: 'Trocar a roupa de cama', emoji: '🛏️', every: 14 },
  { name: 'Regar as plantas', emoji: '🪴', every: 3 },
]
