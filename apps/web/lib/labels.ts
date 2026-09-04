/**
 * Every string a person reads, in one place. Code is English (project convention); the interface
 * is pt-BR, which is the only locale today — this module is the seam if that ever changes.
 */
export const t = {
  appName: 'Treasurer',

  event: {
    newEvent: 'Novo rolê',
    name: 'Nome do rolê',
    date: 'Data',
    create: 'Criar rolê',
    expenses: 'Despesas',
    addExpense: 'Adicionar despesa',
    description: 'Descrição',
    amount: 'Valor',
    paidBy: 'Quem pagou',
    whoCame: 'Quem foi',
    total: 'Total',
    noExpenses: 'Nenhuma despesa ainda.',
    remove: 'Remover',
    publish: 'Fechar rateio e liberar os valores',
    published: 'Valores liberados para os membros',
    settle: 'Marcar evento como quitado',
    saveRoster: 'Salvar quem foi',
    members: 'Membros',
  },

  settlement: {
    member: 'Membro',
    code: 'Cód',
    share: 'Parte',
    toPay: 'A pagar',
    receives: 'Recebe',
    rounding: 'Arredondamento pro caixa',
    paid: 'Recebido',
    markPaid: 'Marcar como recebido',
    markReimbursed: 'Marcar como devolvido',
    reimbursed: 'Devolvido',
    copy: 'Copiar resumo pro zap',
    copied: 'Copiado!',
  },

  member: {
    yourShare: 'Sua parte',
    rounding: 'Arredondamento (vai pro caixa)',
    toPay: 'A pagar',
    youReceive: 'Você recebe',
    settled: 'Você está quitado',
    exact: 'Pague o valor exato — os centavos identificam você.',
    broughtOwn: 'você trouxe a sua',
    notReady: 'O rateio ainda está sendo fechado. Volte daqui a pouco.',
    noEvent: 'Nenhum rolê aberto no momento.',
  },

  admin: {
    title: 'Membros',
    add: 'Adicionar membro',
    name: 'Nome',
    retire: 'Marcar como saiu',
    retired: 'Saiu do clube',
    link: 'Link',
    copyLink: 'Copiar link',
    treasury: 'Caixa',
  },

  errors: {
    badAmount: 'Valor inválido. Escreva assim: 158,73',
    required: 'Preencha este campo',
    noAccess: 'Link inválido ou expirado.',
  },
} as const;
