// src/config/ssm.ts

import {
  SSMClient,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";

const client = new SSMClient({
  region: "ap-south-1",
});

let browserExamKeys: string[] = [];
let configKey = "";

export async function loadSebConfig() {
  const result = await client.send(
    new GetParametersCommand({
      Names: [
        "/codecoliseum/seb/browserExamKeys",
        "/codecoliseum/seb/configKey",
      ],
      WithDecryption: true,
    })
  );

  console.log(result)

  const params = Object.fromEntries(
    (result.Parameters ?? []).map((p) => [
      p.Name,
      p.Value,
    ])
  );

  const rawKeys = params["/codecoliseum/seb/browserExamKeys"] || "";
  browserExamKeys = rawKeys
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  configKey =
    params["/codecoliseum/seb/configKey"];
}

export function getSebConfig() {
  return {
    browserExamKeys,
    configKey,
  };
}