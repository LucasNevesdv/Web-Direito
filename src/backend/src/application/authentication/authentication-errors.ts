export class ErroCredenciaisInvalidas extends Error {
  constructor() { super('Invalid credentials'); this.name = 'ErroCredenciaisInvalidas'; }
}
export class ErroUsuarioInativo extends Error {
  constructor() { super('Inactive user'); this.name = 'ErroUsuarioInativo'; }
}
export class ErroEscritorioInativo extends Error {
  constructor() { super('No active office membership'); this.name = 'ErroEscritorioInativo'; }
}
export class ErroMultiplosEscritoriosAtivos extends Error {
  constructor() { super('Office selection is not available'); this.name = 'ErroMultiplosEscritoriosAtivos'; }
}
export class ErroTokenAcessoInvalido extends Error {
  constructor() { super('Invalid authenticated session'); this.name = 'ErroTokenAcessoInvalido'; }
}
