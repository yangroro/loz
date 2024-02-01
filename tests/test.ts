import { Loz } from "../src/index";
import { expect } from "chai";
import "mocha";

describe("Loz.init", () => {
  before(() => {
    console.log("TEST_KEY: " + process.env.TEST_KEY);
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("API_KEY environment variable is not set.");
    }
  });

  it("should return true", async () => {
    let loz = new Loz();
    const res = await loz.init();

    expect(res).to.equal(true);
    expect(loz.checkAPI()).to.equal("openai");

    const completion = await loz.completeUserPrompt("1+1=");
    expect(completion.content).to.equal("2");
  });
});

describe("Loz.chekcEnv()", () => {
  it("should return true", () => {
    let loz = new Loz();

    const result = loz.checkEnv();
    expect(result).to.equal(true);
  });
});

describe("Loz.ollama", () => {
  it("should return true", async () => {
    let loz = new Loz("ollama");
    await loz.init();

    const completion = await loz.completeUserPrompt("1+1");
    expect(completion.content).to.equal("2");
  });
});

describe("Loz.openai", () => {
  it("should return true", async () => {
    let loz = new Loz("openai");
    await loz.init();

    const completion = await loz.completeUserPrompt("1+1");
    expect(completion.content).to.equal("2");
  });
});
