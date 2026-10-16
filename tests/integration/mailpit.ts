// A throwaway Mailpit (dev SMTP inbox) and a reader for what it received.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenericContainer, Wait } from "testcontainers";

export interface Mailpit {
  smtpPort: number;
  apiUrl: string;
  stop(): Promise<void>;
}

export async function startMailpit(): Promise<Mailpit> {
  const container = await new GenericContainer("axllent/mailpit:latest")
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp("/api/v1/info", 8025))
    .start();
  return {
    smtpPort: container.getMappedPort(1025),
    apiUrl: `http://${container.getHost()}:${container.getMappedPort(8025)}`,
    stop: async (): Promise<void> => {
      await container.stop();
    },
  };
}

// The e2e web server and the Playwright tests are separate processes: share the URL by file
const URL_FILE = join(tmpdir(), "petdle-e2e-mailpit", "url");
export function publishMailpitUrl(apiUrl: string): void {
  mkdirSync(join(tmpdir(), "petdle-e2e-mailpit"), { recursive: true });
  writeFileSync(URL_FILE, apiUrl);
}
export const publishedMailpitUrl = (): string => readFileSync(URL_FILE, "utf8");

interface Found {
  Subject: string;
  Text: string;
}

// Waits (up to 10 s) for a message to `address`, then returns its subject and text
export async function mailTo(apiUrl: string, address: string): Promise<Found> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const search = (await (
      await fetch(
        `${apiUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
      )
    ).json()) as { messages: { ID: string }[] };
    const first = search.messages[0];
    if (first) {
      return (await (
        await fetch(`${apiUrl}/api/v1/message/${first.ID}`)
      ).json()) as Found;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No mail to ${address} reached Mailpit`);
}

// The sign-in token inside a mail's link
export const tokenIn = (text: string): string =>
  /[?&]login=([\w-]+)/.exec(text)![1]!;
