# MAWAQIT - Alexa Backend

This is a serverless application built with Node.js, Serverless Framework AWS Lambda. 

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/)
- [ASK CLI (Alexa Skills Kit Command Line Interface)](https://developer.amazon.com/en-US/docs/alexa/smapi/ask-cli-command-reference.html)
- [AWS CLI (Amazon Web Services Command Line Interface)](https://aws.amazon.com/cli/)
- [Node.js](https://nodejs.org/) (required for ASK CLI)
- [Serverless Framework](https://www.serverless.com/framework/docs/getting-started`) (`npm install -g serverless`)
- [AWS Vault](https://github.com/99designs/aws-vault#installing) 

## Installation

1. Clone the repository:
```bash
git clone https://github.com/mawaqit/alexa.git
```

2. Change to the project directory:
```bash
cd alexa/lambda
```

3. Install the dependencies:
```bash
npm install
```
## Deployment

1. Start an AWS Vault session with the `mawaqit-external` profile:
```bash
aws-vault exec mawaqit-external
```
2. Change to the project directory:

```bash
cd alexa/lambda
```
3. Deploy your functions to AWS Lambda:

```bash
serverless deploy -s ${stage} -f indexHandler
```

## Stages

Different stages we can use to deploy 

- `dev`
- `prod`


## Project Structure

- `lambda/handlers.js`: Contains the function handlers for your serverless functions.
- `lambda/serverless.yml`: Serverless configuration file that defines your functions, events, and resources.
- `lambda/package.json`: Node.js package file that lists your project dependencies.
- `/interactionModels` : Contains Interaction Models of different locales
- `lambda/aplDocuments` : Contains APL Documents
- `lambda/prompts` : Contains prompts for different locales

## Creating Profile in Alexa Skill Kit Extension

1. Open Visual Studio Code.
2. Go to the Extensions view by clicking on the Extensions icon in the Activity Bar on the side of the window or by pressing `Ctrl+Shift+X`.
3. In the search bar, type "Alexa Skills Kit" and press `Enter`.
4. Click "Install" on the extension named "Alexa Skills Kit" by Amazon.
5. Open the VS Code terminal by pressing `Ctrl + \` (backtick).
6. Type the following command to configure the ASK CLI:
   ```bash
   ask configure
   ```
7. Follow the prompts to log in with your Amazon developer account and set up the CLI. Make sure to select or create a default profile.
8. In the VS Code terminal, type the following command:

   ```bash
   ask configure --profile MAWAQIT
   ```
9. Follow the prompts to log in with your Amazon developer account and set up the "MAWAQIT" profile.
10. To ensure that the "MAWAQIT" profile has been created successfully, run the following command:
   ```bash
   ask configure list-profiles
   ```

## Updating Interaction Model

1. Make sure the interaction model which you wish to update is available in `/interactionModels` directory.

2. Make changes in your required Locale for example in `/interactionModels/en-US.json` 

3. Navigate to Interaction Models directory using CLI.

```bash
cd interactionModels
```
4. To deploy your changes to your Dev Skill to a particular locale for example `en-US`

```bash
ask smapi set-interaction-model --skill-id amzn1.ask.skill.81a30fbf-496f-4aa4-a60b-9e35fb513506 --stage development --locale ${locale} --interaction-model "file:${locale}.json" -p ${profile} --debug 
```
**_NOTE:_**  
- Replace `${locale}` with locale name. For Example: `en-US` or `en-IN` .
- Replace `${profile}` with profile name. For example: `MAWAQIT`

