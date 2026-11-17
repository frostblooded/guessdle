import { dirname, relative, resolve, sep } from "node:path";

const SERVER_ONLY = /^(node:|pg$|express$|ws$|nodemailer$|sharp$)/;

const zoneOf = (file, root) => {
  const rel = relative(root, file).split(sep).join("/");
  if (!rel.startsWith("src/")) {
    return null;
  }
  if (rel.startsWith("src/server/")) {
    return "server";
  }
  if (rel.startsWith("src/game/")) {
    return "game";
  }
  return "client";
};

const check = (from, to, spec) => {
  const bare = !spec.startsWith(".") && !spec.startsWith("/");
  if (from === "game") {
    return bare || to !== "game" ? "game" : null;
  }
  if (from === "server") {
    return !bare && to !== "server" && to !== "game" ? "server" : null;
  }
  if (bare) {
    return SERVER_ONLY.test(spec) ? "clientPackage" : null;
  }
  return to === "server" ? "clientServer" : null;
};

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keeps src/game pure, src/server inside the folders the API image copies, and server code out of the browser bundle.",
    },
    messages: {
      game: "src/game is shared by the browser and the API, so it imports only other src/game files (no packages, no Node, no React). Move '{{spec}}' out of the shared module or pass it in as a parameter.",
      server:
        "The API Docker image copies only src/server and src/game, so '{{spec}}' would crash the API at start (the 2026-10-20 mail-settings outage). Move the code into src/server or src/game.",
      clientServer:
        "Browser code must not import src/server ('{{spec}}'): it would pull server code into the bundle. Put shared logic in src/game and call the API through src/game/transport.ts.",
      clientPackage:
        "'{{spec}}' is a server-only package and cannot run in the browser. Do this work in src/server behind an API route.",
    },
    schema: [],
  },
  create(context) {
    const root = context.cwd;
    const from = zoneOf(context.filename, root);
    if (from === null) {
      return {};
    }
    const visit = (node) => {
      const spec = node.source?.value;
      if (typeof spec !== "string") {
        return;
      }
      const to = spec.startsWith(".")
        ? zoneOf(resolve(dirname(context.filename), spec), root)
        : null;
      const messageId = check(from, to, spec);
      if (messageId !== null) {
        context.report({ node: node.source, messageId, data: { spec } });
      }
    };
    return {
      ImportDeclaration: visit,
      ExportNamedDeclaration: visit,
      ExportAllDeclaration: visit,
      ImportExpression: visit,
    };
  },
};
