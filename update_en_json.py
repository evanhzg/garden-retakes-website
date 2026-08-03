import json
with open('/home/evan/projects/Garden-website/locales/en.json', 'r') as f:
    data = json.load(f)

# Update daily lines
data['home.season2.daily.line'] = "At 01:00 Paris time your previous day is scored on how alike its rounds were, and that multiplies your next session."
data['stats.howRatingWorks.dailyMultiplier'] = "What the pass produces is not points but a multiplier on your next session's Elo movement. The multiplier persists until your next session \u2014 taking a break doesn't reset your consistency streak. It holds while you keep the run going and fades back toward 1.00 as soon as you stop, so it can never be banked: the bonus belongs to the streak, not to the account, and the day you stop being predictable is the day you stop being paid for it."

# Add calibration
data['home.season2.calibration.term'] = "70-round calibration"
data['home.season2.calibration.line'] = "Your first 70 ranked rounds hide your Elo while computing it, setting a fair starting point."
data['stats.howRatingWorks.calibrationHeading'] = "70-round calibration"
data['stats.howRatingWorks.calibrationDesc'] = "Your first 70 ranked rounds in Season 2 are a calibration period. Your ELO is computed but hidden until you complete it \u2014 then your starting ELO is set between 4,500 and 6,500 based on your performance."

# Add banner strings
data['season.break.banner.frozen'] = "Season 1 is on a break. Ranked and Competitive Retakes will return {date}. Cast your vote at {link}."
data['season.break.banner.soon'] = "Season 2 starts soon \u2014 stay tuned."
data['season.break.start_season'] = "Start season now"
data['season.break.start_season_desc'] = "Run !season_start in game to open the season."

with open('/home/evan/projects/Garden-website/locales/en.json', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
