/**
 * Botão "Enviar ao MeuMix" (favorito do navegador). Roda na aba da partida na
 * GC, com o login de quem clicou: busca as estatísticas, o resultado (RP,
 * mapa, nick e SteamID) e os destaques da partida (as mesmas requisições que
 * a página já faz) e abre o MeuMix com os
 * dados. Os cookies da GC nunca saem do navegador.
 */
export function gcBookmarklet(origin: string) {
  const code = `(async()=>{try{
var m=location.pathname.match(/\\/match\\/(\\d+)/);
if(location.hostname.indexOf('gamersclub.com.br')<0||!m){alert('Abra a página de uma partida da Gamers Club (gamersclub.com.br/lobby/match/...) e clique de novo.');return}
var id=m[1],g=function(u){return fetch(u,{credentials:'include',headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})};
var r=await Promise.all([g('/api/lobby/match/'+id+'/stats'),g('/api/allstar/highlights/lobby/'+id),g('/lobby/match/'+id+'/1')]);
if(!r[0]||!r[0].scoreboard){alert('Não consegui ler as estatísticas. Confira se você está logado na GC e se a partida já terminou.');return}
var k=function(ps){var o={};['team_a','team_b'].forEach(function(t){o[t]=((ps||{})[t]||[]).map(function(x){var p=x.player||{};return{idplayer:x.idplayer,rating_points:x.rating_points,player:{id:p.id,nick:p.nick,plSteamID64:p.plSteamID64}}})});return o};
var t=(document.body.innerText||'').slice(0,30000),n=['Mirage','Inferno','Dust2','Dust 2','Nuke','Ancient','Anubis','Train','Overpass','Vertigo','Cache'].filter(function(x){return t.indexOf(x)>=0});
var w=window.open(${JSON.stringify(`${origin}/admin/importar-gc`)}+'#'+encodeURIComponent(JSON.stringify({v:1,id:id,stats:r[0],highlights:r[1],result:r[2]&&r[2].jogos?{jogos:{map_name:r[2].jogos.map_name,players:k(r[2].jogos.players)}}:null,pageMaps:n})),'_blank');
if(!w)alert('O navegador bloqueou a janela do MeuMix. Permita pop-ups para gamersclub.com.br e clique de novo.');
}catch(e){alert('Erro ao enviar ao MeuMix: '+e.message)}})()`;
  return `javascript:${encodeURIComponent(code.replace(/\n/g, ""))}`;
}

/** Fila de mapas recebidos (localStorage do navegador do admin). */
export const GC_QUEUE_KEY = "meumix:gc-queue";
/** Última página de finalização aberta (para o "voltar" da tela de recebimento). */
export const GC_RETURN_KEY = "meumix:gc-return";
/** Máximo de mapas na fila (uma série tem até 5). */
export const GC_QUEUE_MAX = 6;
