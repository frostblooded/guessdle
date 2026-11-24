import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  imageUrls,
  listOf,
  listTitles,
  readList,
  readPage,
  type WikiFetch,
} from "../../src/routes/import/wikipedia.ts";

const doc = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");

const LIST = `<body><section>
  <table class="wikitable">
    <tr><th>Film</th><th>Year</th></tr>
    <tr><th scope="row"><a rel="mw:WikiLink" href="./Toy_Story">Toy Story</a></th><td>1995</td></tr>
    <tr><th scope="row"><a rel="mw:WikiLink" href="./Cars_(film)">Cars</a></th><td><a rel="mw:WikiLink" href="./2006">2006</a></td></tr>
    <tr><td><a rel="mw:WikiLink" href="./File:Logo.png">logo</a></td></tr>
  </table>
  <ul><li><a rel="mw:WikiLink" href="./Up_(2009_film)">Up</a></li></ul>
</section></body>`;

const PAGE = `<body><table class="infobox">
  <tr><td><img src="//upload.wikimedia.org/wikipedia/en/thumb/1/13/Toy_Story.jpg/250px-Toy_Story.jpg" data-file-width="300" width="250" height="375"></td></tr>
  <tr><th class="infobox-label">Directed by</th><td class="infobox-data">John Lasseter<sup class="reference">[1]</sup></td></tr>
  <tr><th class="infobox-label">Production<br>company</th><td class="infobox-data">Pixar</td></tr>
  <tr><th class="infobox-label">Starring</th><td class="infobox-data"><ul><li>Tom Hanks</li><li>Tim Allen</li></ul></td></tr>
  <tr><th class="infobox-label">Running time</th><td class="infobox-data">81 minutes</td></tr>
</table></body>`;

describe("listOf", () => {
  it("reads the language and title from a link, or a bare title", () => {
    assert.deepEqual(
      listOf("https://de.wikipedia.org/wiki/Liste_der_Pixar-Filme"),
      {
        wiki: "de",
        title: "Liste der Pixar-Filme",
      },
    );
    assert.deepEqual(listOf("List of Pixar films"), {
      wiki: "en",
      title: "List of Pixar films",
    });
    assert.equal(listOf("https://example.com/wiki/X"), null);
  });
});

describe("listTitles", () => {
  it("takes each table row's first article link, skipping files", () => {
    assert.deepEqual(listTitles(doc(LIST), "auto"), [
      "Toy Story",
      "Cars (film)",
    ]);
  });

  it("reads bullet lists when asked", () => {
    assert.deepEqual(listTitles(doc(LIST), "bullets"), ["Up (2009 film)"]);
  });
});

describe("imageUrls", () => {
  it("imports the original file when it is narrow and a 500px thumb when wide", () => {
    const thumb =
      "//upload.wikimedia.org/wikipedia/en/thumb/1/13/Toy_Story.jpg/250px-Toy_Story.jpg";
    assert.equal(
      imageUrls(thumb, 300).import,
      "https://upload.wikimedia.org/wikipedia/en/1/13/Toy_Story.jpg",
    );
    assert.equal(
      imageUrls(thumb, 2000).import,
      "https://upload.wikimedia.org/wikipedia/en/thumb/1/13/Toy_Story.jpg/500px-Toy_Story.jpg",
    );
  });
});

const fakeWikipedia =
  (pages: Record<string, string>, calls: string[] = []): WikiFetch =>
  async (url) => {
    calls.push(url);
    const body = Object.entries(pages).find(([path]) =>
      url.includes(path),
    )?.[1];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      text: async () => body ?? "",
    };
  };

const noWait = async (): Promise<void> => {};

describe("reading", () => {
  it("reads infobox fields and the page image from Wikipedia", async () => {
    const fetch = fakeWikipedia({
      "page/html/Toy_Story": PAGE,
      "page/summary/Toy_Story": JSON.stringify({
        title: "Toy Story",
        originalimage: {
          source:
            "https://upload.wikimedia.org/wikipedia/en/1/13/Toy_Story.jpg",
          width: 300,
          height: 450,
        },
      }),
    });
    const row = await readPage(fetch, noWait, "en", "Toy Story", 3);
    assert.ok(typeof row === "object");
    assert.equal(row.order, 3);
    assert.equal(
      row.image,
      "https://upload.wikimedia.org/wikipedia/en/1/13/Toy_Story.jpg",
    );
    assert.deepEqual(row.thumbSize, [300, 450]);
    assert.deepEqual(row.fields, {
      "Directed by": "John Lasseter",
      "Production company": "Pixar",
      Starring: ["Tom Hanks", "Tim Allen"],
      "Running time": "81 minutes",
    });
  });

  it("tells a page without an infobox from one that kept failing", async () => {
    const fetch = fakeWikipedia({ "page/html/Plain": "<body><p>x</p></body>" });
    assert.equal(await readPage(fetch, noWait, "en", "Plain", 0), "no-infobox");
    const failing: WikiFetch = async () => ({
      ok: false,
      status: 429,
      text: async () => "",
    });
    assert.equal(await readPage(failing, noWait, "en", "Busy", 0), "failed");
  });

  it("reads the list page from the wiki in the link", async () => {
    const calls: string[] = [];
    const fetch = fakeWikipedia(
      { "page/html/List_of_Pixar_films": LIST },
      calls,
    );
    const titles = await readList(
      fetch,
      noWait,
      { wiki: "en", title: "List of Pixar films" },
      "auto",
    );
    assert.deepEqual(titles, ["Toy Story", "Cars (film)"]);
    assert.ok(
      calls[0]!.startsWith("https://en.wikipedia.org/api/rest_v1/page/html/"),
    );
  });
});
