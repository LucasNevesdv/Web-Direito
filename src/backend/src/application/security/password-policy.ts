export function senhaAtendePolitica(senha: unknown): senha is string {
  return typeof senha === 'string' && Array.from(senha).length >= 12 && Array.from(senha).length <= 128;
}
