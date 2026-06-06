// src/config/seb.ts

import {
  SSMClient,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";

const client = new SSMClient({
  region: "ap-south-1",
});

let browserExamKey = "";
let configKey = "";

export async function loadSebConfig() {
  const result = await client.send(
    new GetParametersCommand({
      Names: [
        "/codecoliseum/seb/browserExamKey",
        "/codecoliseum/seb/configKey",
      ],
      WithDecryption: true,
    })
  );

  const params = Object.fromEntries(
    (result.Parameters ?? []).map((p) => [
      p.Name,
      p.Value,
    ])
  );

  browserExamKey =
    params["/codecoliseum/seb/browserExamKey"];

  configKey =
    params["/codecoliseum/seb/configKey"];
}

export function getSebConfig() {
  return {
    browserExamKey,
    configKey,
  };
}