import { getDataSource } from "@/services";
import { liveChannels, toStreamItems } from "@/services/twitch";
import { TwitchStreams } from "./twitch-streams";

/** "Ao vivo agora": jogadores transmitindo na Twitch (some quando ninguém está ao vivo). */
export async function LiveNow() {
  const lives = await liveChannels();
  if (!lives.length) return null;
  const players = new Map((await getDataSource().listPlayers()).map((p) => [p.id, p]));
  const items = toStreamItems(lives, players);
  if (!items.length) return null;
  return (
    <TwitchStreams
      className="mb-4"
      title="Ao vivo agora"
      description={`${items.length} ${items.length > 1 ? "jogadores transmitindo" : "jogador transmitindo"} na Twitch`}
      items={items}
    />
  );
}
