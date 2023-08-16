import fs from "node:fs/promises";
import pMap from "p-map";

const baseUrl = `https://github.com/Tigerchops/Scribed-Bricks/blob/e6f290077c1c01ebd057b5c3c8f05d74d499fb80/images`;
const items = Array.from({ length: 5_000 })
  .fill(0)
  .map((_, index) => index);

let html = "";

function splitArrayIntoGroups(array, groupSize) {
  const result = [];ws

  for (let i = 0; i < array.length; i += groupSize) {
    result.push(array.slice(i, i + groupSize));
  }

  return result;
}

const originalArray = items;
const groupSize = 100;
const groupedArrays = splitArrayIntoGroups(originalArray, groupSize);

const stats = { minted: 0, supply: originalArray.length };

await pMap(
  groupedArrays,
  async (items, idx) => {
    console.log("group:", idx + 1);
    const mapped = await pMap(
      items,
      async (index) => {
        const imageBlob = await fetch(`${baseUrl}/${index}.png`).then((res) =>
          res.blob()
        );
        const arrBuffer = await imageBlob.arrayBuffer();
        const buf = Buffer.from(arrBuffer);
        const dataURI = `data:image/png;base64,${buf.toString("base64")}`;
        const sha = await sha256(dataURI);

        return { index, sha, dataURI };
      },
      { concurrency: 50 }
    );

    const exists = await checkExists(mapped);

    if (exists === null) {
      console.log("some error");
      // alert("Something failed!");
      return;
    }

    await pMap(
      exists,
      async (x) => {
        if (x.eth) {
          stats.minted += 1;
          html += `<a href="https://ethscriptions.com/ethscriptions/${x.eth.transaction_hash}" target="_blank" class="item" data-minted="true" style="opacity: 0.5" title="MINTED! Scribed-Brick ${x.index}" data-id="${x.index}"><img alt="Scribed-Brick ${x.index}" loading="lazy" src="https://api.ethscriptions.com/api/ethscriptions/${x.eth.transaction_hash}/data" style="width: 128px; height: 128px; border: 2px dashed red;"></a>`;
        } else {
          html += `<div class="item" data-id="${x.index}" title="Scribed-bricks ${x.index}"><img alt="Scribed-Brick ${x.index}" loading="lazy" src="${x.dataURI}" style="width: 128px; height: 128px;"></div>`;
          // const div = `<div class="item" data-id="${index}"><img alt="Moonbird ${index}" src="https://api.github.com/repos/Tigerchops/Scribed-Bricks/images/${index}.png" style="width: 128px; height: 128px;"></div>`;
        }
      },
      { concurrency: 50 }
    );
    console.log("group end", idx + 1);
  },
  { concurrency: 5 }
).then(async () => {
  const indexHtml = await fs.readFile("./template.html", "utf-8");
  const newIndex = indexHtml.replace(
    `<div id="container"></div>`,
    `<div id="container">${html}</div>`
  );

  await fs.writeFile("./index.html", newIndex);
  await fs.writeFile("./status.json", JSON.stringify(stats));
});

async function sha256(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

async function checkExists(list) {
  const resp = await fetch(
    `https://api.ethscriptions.com/api/ethscriptions/exists_multi`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(list.map((x) => x.sha)),
    }
  );

  if (!resp.ok) {
    console.log("some err", resp);
    return null;
  }

  const exists = await resp.json();

  return list.map((x) => ({ ...x, eth: exists[x.sha] }));

  // if (exists.result) {
  //   return exists.ethscription;
  // }
  // return false;
}
