import json

def update_json(file_path, new_entries):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    data.update(new_entries)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Updated {file_path}")

en_entries = {
  "utility.updateScreenshot": "Update Screenshot",
  "utility.capturePreview": "Capture Preview",
  "utility.accept": "Accept",
  "utility.reject": "Reject",
  "utility.suggestModifications": "Suggest Modifications",
  "utility.newSetpos": "New Setpos",
  "utility.notes": "Notes",
  "utility.submitSuggestion": "Submit Suggestion",
  "utility.submitting": "Submitting...",
  "utility.capturing": "Waiting for capture...",
  "admin.captureSuggestions.empty": "No capture suggestions waiting.",
  "admin.captureSuggestions.lineup": "Lineup",
  "admin.captureSuggestions.setpos": "Setpos",
  "admin.captureSuggestions.notes": "Notes",
  "admin.approve": "Approve",
  "admin.reject": "Reject"
}

fr_entries = {
  "utility.updateScreenshot": "Mettre à jour la capture",
  "utility.capturePreview": "Aperçu de la capture",
  "utility.accept": "Accepter",
  "utility.reject": "Rejeter",
  "utility.suggestModifications": "Suggérer des modifications",
  "utility.newSetpos": "Nouveau Setpos",
  "utility.notes": "Notes",
  "utility.submitSuggestion": "Soumettre la suggestion",
  "utility.submitting": "Soumission...",
  "utility.capturing": "En attente de la capture...",
  "admin.captureSuggestions.empty": "Aucune suggestion de capture en attente.",
  "admin.captureSuggestions.lineup": "Lineup",
  "admin.captureSuggestions.setpos": "Setpos",
  "admin.captureSuggestions.notes": "Notes",
  "admin.approve": "Approuver",
  "admin.reject": "Rejeter"
}

update_json("locales/en.json", en_entries)
update_json("locales/fr.json", fr_entries)
