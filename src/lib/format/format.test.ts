import { describe, expect, it } from 'vitest'
import { D } from '../calc/money'
import { fmtDate, fmtMoney, fmtMoneySigned, fmtPct, fmtPctSigned, fmtPrice, fmtQty, parseNumberBR, todayISO } from './index'

describe('formato brasileiro', () => {
  it('dinheiro', () => {
    expect(fmtMoney(D('1234.56'), 'BRL')).toBe('R$ 1.234,56')
    expect(fmtMoney(D('1234.5'), 'USD')).toBe('US$ 1.234,50')
    expect(fmtMoney(null, 'BRL')).toBe('—')
  })
  it('sempre com sinal em alta e baixa', () => {
    expect(fmtMoneySigned(D('10'), 'BRL')).toBe('+R$ 10,00')
    expect(fmtMoneySigned(D('-10'), 'BRL')).toBe('−R$ 10,00')
    expect(fmtPctSigned(D('-2.345'))).toBe('−2,35%')
    expect(fmtPctSigned(D('2.5'))).toBe('+2,5%')
  })
  it('percentual, quantidade e preço', () => {
    expect(fmtPct(D('12.5'))).toBe('12,5%')
    expect(fmtPct(D('50'))).toBe('50,0%')
    expect(fmtQty(D('0.00724287'))).toBe('0,00724287')
    expect(fmtQty(D('1500'))).toBe('1.500')
    expect(fmtPrice(D('0.012345'), 'USD')).toBe('US$ 0,012345')
    expect(fmtPrice(D('73785.674'), 'USD')).toBe('US$ 73.785,67')
  })
  it('datas', () => {
    expect(fmtDate('2026-11-12')).toBe('12/11/2026')
    expect(todayISO(new Date('2026-11-13T01:30:00Z'))).toBe('2026-11-12') // 22:30 em Brasília
  })
  it('lê número digitado', () => {
    expect(parseNumberBR('1.234,56')).toBe('1234.56')
    expect(parseNumberBR('0,00724287')).toBe('0.00724287')
    expect(parseNumberBR('1234.56')).toBe('1234.56')
    expect(parseNumberBR('abc')).toBeNull()
    expect(parseNumberBR('')).toBeNull()
    expect(parseNumberBR('-5')).toBeNull()
  })
})
