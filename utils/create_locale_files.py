import shutil
import os

prompts_dir = "lambda/prompts"
interaction_models_dir = "interactionModels"


files_to_create = {
    prompts_dir: {
        "en_US.js": ["en_IN.js", "en_AU.js", "en_GB.js", "en_CA.js"],
        "es_ES.js": ["es_MX.js", "es_US.js"],
        "fr_FR.js": ["fr_CA.js"],
        "ar_SA.js": [],
        "de_DE.js": [],
        "it_IT.js": [],
        "nl_NL.js": [],
        "pt_BR.js": [],
    },
    interaction_models_dir: {
        "en-US.json": ["en-IN.json", "en-AU.json", "en-GB.json", "en-CA.json"],
        "es-ES.json": ["es-MX.json", "es-US.json"],
        "fr-FR.json": ["fr-CA.json"],
        "ar-SA.json": [],
        "de-DE.json": [],
        "it-IT.json": [],
        "nl-NL.json": [],
        "pt-BR.json": [],
    },
}


def copy_files(directory, source, targets):
    src_path = os.path.join(directory, source)
    for target in targets:
        dest_path = os.path.join(directory, target)
        shutil.copy(src_path, dest_path)
        print(f"Copied {src_path} to {dest_path}")


for directory, files in files_to_create.items():
    for src_file, dest_files in files.items():
        copy_files(directory, src_file, dest_files)

print("All files have been successfully copied.")
