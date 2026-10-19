// /party: find a party by code; /party?host=<slug>: open one on a game; /party/<CODE>: the party.
import { useParams, useSearchParams } from "react-router";
import { normalizeCode } from "../../game/party.ts";
import { CodeForm, HostForm } from "./party-forms.tsx";
import { MISSING, PartyRoom } from "./party-room.tsx";

function PartyScreen() {
  const { code: raw } = useParams();
  const [params] = useSearchParams();
  const host = params.get("host");
  if (raw !== undefined) {
    const code = normalizeCode(raw);
    return code === null ? (
      <CodeForm error={MISSING} />
    ) : (
      <PartyRoom key={code} code={code} />
    );
  }
  return host === null ? <CodeForm /> : <HostForm slug={host} />;
}

// A phone-first page: kept narrow on wide screens
export function PartyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PartyScreen />
    </div>
  );
}
