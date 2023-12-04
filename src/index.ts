import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

import { ChatHistory, PromptAndAnswer } from "./history";
import { Config, ConfigItem } from "./config";
import { Git } from "./git";

const readline = require("readline");

require("dotenv").config();

const DEBUG = process.env.DEBUG === "true" ? true : false;
// Get the path to the home directory
const HOME_PATH = process.env.HOME || "";
const LOG_DEV_PATH = "logs";

interface GPTSettings {
  model: string;
  prompt: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  stream: boolean;
  frequency_penalty: number;
  presence_penalty: number;
  stop?: string[];
}

export class Loz {
  defaultSettings: GPTSettings;
  openai: any;
  chatHistory: ChatHistory = { date: "", dialogue: [] };
  curPromptAndAnswer: PromptAndAnswer = { mode: "", prompt: "", answer: "" };
  configfPath: string;
  curCompleteText: string = "";
  config: Config = new Config();
  git: Git = new Git();

  constructor() {
    this.checkEnv();
    this.defaultSettings = {
      model: "gpt-3.5-turbo",
      prompt: "",
      temperature: 0,
      max_tokens: 60,
      top_p: 1.0,
      stream: true,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    };

    this.openai = new OpenAI();

    // Create a config for the application
    this.configfPath = path.join(HOME_PATH, ".loz");
    if (!fs.existsSync(this.configfPath)) {
      fs.mkdirSync(this.configfPath);
    }

    if (this.checkGitRepo() === true) {
      if (!fs.existsSync(LOG_DEV_PATH)) {
        fs.mkdirSync(LOG_DEV_PATH);
      }
    }

    this.loadingConfigFromJSONFile();
  }

  // load config from JSON file
  async loadingConfigFromJSONFile() {
    // Check if the config file exists
    if (this.checkGitRepo() === true) {
      this.config.loadConfig(this.configfPath);
    }
    //this.config.add(new ConfigItem("mode", "learning_english"));
  }

  checkEnv() {
    if (process.env.OPENAI_API_KEY === undefined) {
      console.error("Please set OPENAI_API_KEY in your environment variables");
      // system end
      process.exit(1);
    }

    return true;
  }

  // Save chat history (JSON) to file.
  async saveChatHistory() {
    const date = new Date();

    const fileName =
      date.getFullYear() +
      "-" +
      (date.getMonth() + 1) +
      "-" +
      date.getDate() +
      "-" +
      date.getHours() +
      "-" +
      date.getMinutes() +
      "-" +
      date.getSeconds() +
      ".json";
    const filePath = this.checkGitRepo()
      ? path.join(LOG_DEV_PATH, fileName)
      : path.join(this.configfPath, fileName);
    this.chatHistory.date = date.toString();
    if (DEBUG) console.log(this.chatHistory);
    const json = JSON.stringify(this.chatHistory, null, 2);

    fs.writeFileSync(filePath, json);
  }

  saveConfig() {
    if (this.checkGitRepo() === true) {
      const json = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configfPath + "/config.json", json);
    }
  }

  async openaiChatCompletionCreate(params: OpenAI.Chat.ChatCompletionCreateParams) {
    const completion = await this.openai.chat.completions.create(params);

    return completion;
  }

  // Handle the input from the pipe
  handlePipeInput(prompt: string) {
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", async (data: String) => {
      this.defaultSettings.prompt = prompt + "\n" + data;
      this.defaultSettings.stream = false;
      this.defaultSettings.max_tokens = 500;

      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: this.defaultSettings.prompt }],
        max_tokens: this.defaultSettings.max_tokens,
      };

      let completion: any;
      try {
        completion = await this.openaiChatCompletionCreate(params);
      } catch (error: any) {
        if (error.response) {
          console.log(error.response.status);
          console.log(error.response.data);
        } else {
          console.log(error.message);
        }
      }
      process.stdout.write(completion.choices[0]?.message?.content);
      process.stdout.write("\n");
    });
  }

  async runGitCommit() {
    let diff = await this.git.getDiffFromStaged();

    // Remove the first line of the diff
    diff = diff.replace(/.*\n/, "");

    const prompt =
      "Generate a commit message for the following code changes:\n";

    this.defaultSettings.prompt = prompt + diff;
    this.defaultSettings.stream = false;
    this.defaultSettings.max_tokens = 500;

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt + diff }],
    };

    let completion: any;
    try {
      completion = await this.openai.chat.completions.create(params);
    } catch (error: any) {
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
      } else {
        console.log(error.message);
      }
    }

    try {
      await this.git.commit(completion.choices[0]?.message?.content);
    } catch (error: any) {
      console.log(error);
    }
  }

  writeGitCommitMessage() {
    const prompt =
      "Generate a commit message for the following code changes like this:\n\
         title\n\
         <empty line>\n\
         description\n";
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", async (data: String) => {
      // Remove the first line from data
      // because it is not needed for GPT-3 (added by Copilot)
      data = data.replace(/.*\n/, "");
      // Remove Author and Date from commit message
      // because it is not needed for GPT-3 (added by Copilot)
      const commitMessage = data
        .toString()
        .replace(/Author: .*\n/, "")
        .replace(/Date: .*\n/, "");

      this.defaultSettings.prompt = prompt + commitMessage;
      this.defaultSettings.stream = false;
      this.defaultSettings.max_tokens = 500;
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt + commitMessage }],
      };
      let completion: any;
      try {
        completion = await this.openai.chat.completions.create(params);
      } catch (error: any) {
        if (error.response) {
          console.log(error.response.status);
          console.log(error.response.data);
        } else {
          console.log(error.message);
        }
      }
      process.stdout.write(completion.choices[0]?.message?.content);
    });

    process.stdin.on("end", () => {
      //process.exit();
    });
  }

  async runCompletion(settings: any, rl: any) {
    let stream: any;
    const streaming_params: OpenAI.Chat.ChatCompletionCreateParams = {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: settings.prompt }],
      stream: true,
      max_tokens: this.defaultSettings.max_tokens,
      temperature: this.defaultSettings.temperature,
      top_p: this.defaultSettings.top_p,
      frequency_penalty: this.defaultSettings.frequency_penalty,
      presence_penalty: this.defaultSettings.presence_penalty,
      stop: ["\n", "Author:", "Date:"],
    };
    try {
      stream = await this.openai.chat.completions.create(streaming_params);
    } catch (error: any) {
      console.log(error.message + ":");
      if (error.response) {
        // console.log(error.response.data);
        if (error.response.status === 401) {
          console.log("Invalid API key");
        } else if (error.response.status === 429) {
          console.log("API request limit reached");
        }
      }
      process.exit();
    }
    if (DEBUG === true) console.log(stream.data);

    try {
      for await (const data of stream) {
        if (data === null) return;
        const streamData = data.choices[0]?.delta?.content || "";
        this.curCompleteText += streamData;
        process.stdout.write(streamData);
      }
      process.stdout.write("\n");
    } catch (error) {
      console.error("An error occurred during OpenAI request: ", error);
    }

    this.curPromptAndAnswer.answer = this.curCompleteText;
    this.chatHistory.dialogue.push(this.curPromptAndAnswer);
    this.curCompleteText = "";
    rl.prompt();
  }

  runPromptIntractive() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Output the current mode.
    this.config.print();

    // Set the prompt to display before each input
    rl.setPrompt("> ");

    // Show the cursor and prompt the user for input
    rl.prompt();

    // Set the terminal to raw mode to allow for cursor manipulation
    process.stdin.setRawMode(true);

    // Display a blinking cursor
    setInterval(() => {
      process.stdout.write("\x1B[?25h");
      setTimeout(() => {
        process.stdout.write("\x1B[?25l");
      }, 500);
    }, 1000);

    // Listen for user input
    rl.on("line", (input: string) => {
      // Tokenize the input with space as the delimiter
      const tokens = input.split(" ");
      if (input === "exit" || input === "quit") {
        console.log("Good bye!");
        this.saveChatHistory();
        this.saveConfig();
        process.exit(0);
      } else if (input.indexOf("config") === 0 && tokens.length <= 3) {
        if (tokens.length === 3) {
          if (this.config.get(tokens[1]) !== undefined) {
            console.log(
              `${this.config.get(tokens[1])?.value} will be updated with ${
                tokens[2]
              }`
            );
          }
          this.config.set(tokens[1], tokens[2]);
        } else if (tokens.length === 2) {
          console.log(this.config.get(tokens[1]));
        } else if (tokens.length === 1) {
          this.config.print();
        } else console.log("Invalid command");
        rl.prompt();
        return;
      }

      if (input.length !== 0) {
        let mode = this.config.get("mode")?.value;
        // ESL: English as a Second Language
        if (this.config.get("mode")?.value === "esl") {
          this.defaultSettings.prompt =
            "Rephrase the following question to make it sound more natural and asnwer the question: \n";
        } else if (this.config.get("mode")?.value === "proofread") {
          this.defaultSettings.prompt =
            "Can you proofread the following setnence? Show me the difference between the given sentence and your correction.\n";
        }
        this.defaultSettings.prompt += input;
        this.defaultSettings.max_tokens = 4000;
        this.runCompletion(this.defaultSettings, rl);
        if (mode === undefined) mode = "default";
        this.curPromptAndAnswer = new PromptAndAnswer(mode, input, "");
      }
    });

    // Handle CTRL+C to exit the program
    rl.on("SIGINT", () => {
      rl.close();
      console.log("Good bye!");
      this.saveChatHistory();
      this.saveConfig();
      process.exit(0);
    });
  }

  // check if the program is running in it's git repository.
  checkGitRepo() {
    const gitRepoPath = path.join(__dirname, "../.git");
    if (fs.existsSync(gitRepoPath)) {
      return true;
    }
    return false;
  }
}
