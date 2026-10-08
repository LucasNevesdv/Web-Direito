import { isIP } from 'node:net';
import type { MetadadosSessao } from '../application/authentication/session-management-contracts.js';

export function capturarMetadadosSessao(agente: string | undefined, ip: string): MetadadosSessao {
  const normalizado = (agente ?? '').slice(0, 512).replace(/[^\x20-\x7e]/g, '');
  const navegador = /Edg\//.test(normalizado) ? 'Edge' : /Firefox\//.test(normalizado) ? 'Firefox' : /Chrome\//.test(normalizado) ? 'Chrome' : /Safari\//.test(normalizado) ? 'Safari' : 'Desconhecido';
  const dispositivo = /Android/.test(normalizado) ? 'Android' : /iPhone|iPad/.test(normalizado) ? 'iOS' : /Windows/.test(normalizado) ? 'Windows' : /Macintosh/.test(normalizado) ? 'macOS' : /Linux/.test(normalizado) ? 'Linux' : 'Desconhecido';
  const endereco = ip.replace(/^::ffff:/i, '');
  const ipMascarado = isIP(endereco) === 4 ? endereco.split('.').slice(0, 2).join('.') + '.*.*' : isIP(endereco) === 6 ? 'IPv6 (mascarado)' : 'Indisponível';
  return { navegador, dispositivo, ipMascarado };
}

