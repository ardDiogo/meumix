/** Chave de apelido: sem acento, minúsculo e com espaços simples (casa "As Vezes  Sei Lá" com "as vezes sei la"). */
export const aliasKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 64);
