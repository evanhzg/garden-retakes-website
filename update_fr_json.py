import json
with open('/home/evan/projects/Garden-website/locales/fr.json', 'r') as f:
    data = json.load(f)

# Update daily lines
data['home.season2.daily.line'] = "À 01h00, heure de Paris, vos rounds de la veille sont notés sur leur régularité, et cela multiplie les gains de votre prochaine session."
data['stats.howRatingWorks.dailyMultiplier'] = "Ce que produit cette passe, ce ne sont pas des points mais un multiplicateur sur les mouvements d'Elo de votre prochaine session. Le multiplicateur persiste jusqu'à votre prochaine session \u2014 faire une pause ne réinitialise pas votre série de constance. Il tient tant que vous entretenez la série et retombe vers 1,00 dès que vous arrêtez : il ne se met jamais en banque. Le bonus appartient à la série, pas au compte \u2014 le jour où vous cessez d'être prévisible est le jour où il cesse d'être versé."

# Add calibration
data['home.season2.calibration.term'] = "Étalonnage sur 70 rounds"
data['home.season2.calibration.line'] = "Vos 70 premiers rounds classés calculent mais masquent votre Elo pour définir un point de départ juste."
data['stats.howRatingWorks.calibrationHeading'] = "Étalonnage sur 70 rounds"
data['stats.howRatingWorks.calibrationDesc'] = "Vos 70 premiers rounds classés de la Saison 2 constituent une période d'étalonnage. Votre ELO est calculé mais masqué jusqu'à ce que vous l'ayez terminée \u2014 ensuite, votre ELO de départ est fixé entre 4 500 et 6 500 selon vos performances."

# Add banner strings
data['season.break.banner.frozen'] = "La saison 1 est en pause. Les retakes classés et compétitifs reviendront le {date}. Votez sur {link}."
data['season.break.banner.soon'] = "La saison 2 commence bientôt — restez à l'écoute."
data['season.break.start_season'] = "Démarrer la saison"
data['season.break.start_season_desc'] = "Exécutez !season_start en jeu pour ouvrir la saison."

with open('/home/evan/projects/Garden-website/locales/fr.json', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
