export type Kind = 'in' | 'out'
export type Method = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'boleto' | 'outro'
export type PantryStatus = 'cheio' | 'acabando' | 'acabou'

export interface Household { id: string; name: string; invite_code: string; city: string; uf: string }
export interface Member { household_id: string; user_id: string; name: string; fruit: string; created_at: string }
export interface Market { id: string; name: string; cnpj: string | null; address: string | null }
export interface Item {
  id: string; name: string; qty: number; unit: string; section: string; note: string | null
  checked: boolean; price: number | null; added_by: string | null; checked_by: string | null
  checked_at: string | null; pantry_id: string | null; created_at: string
}
export interface Trip { id: string; market_id: string | null; total: number; items_count: number; created_by: string | null; created_at: string }
export interface Price { id: string; market_id: string | null; name: string; norm: string; unit: string; unit_price: number; seen_at: string }
export interface Pantry { id: string; name: string; section: string; status: PantryStatus; updated_by: string | null; updated_at: string }
export interface Chore {
  id: string; name: string; emoji: string; every_days: number; rotate: boolean
  assignee: string | null; last_done_at: string | null; last_done_by: string | null; created_at: string
}
export interface ChoreLog { id: string; chore_id: string; done_by: string; done_at: string }
export interface Category { id: string; name: string; emoji: string; kind: Kind; sort: number; archived: boolean }
export interface Card { id: string; name: string; color: string; closing_day: number; due_day: number; limit_amount: number | null; archived: boolean }
export interface Bill {
  id: string; name: string; emoji: string; amount: number; due_day: number; variable: boolean
  category_id: string | null; active: boolean
}
export interface Tx {
  id: string; kind: Kind; amount: number; description: string; category_id: string | null
  member_id: string | null; occurred_on: string; month: string; method: Method; card_id: string | null
  group_id: string | null; installment: number | null; installments: number | null
  bill_id: string | null; trip_id: string | null; created_by: string | null; created_at: string
}
export interface Goal { id: string; name: string; emoji: string; target: number; deadline: string | null; color: string; archived: boolean; created_at: string }
export interface GoalMove { id: string; goal_id: string; amount: number; member_id: string | null; month: string; note: string | null; created_at: string }
