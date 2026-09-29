// Complete September 26 talent workshop export. Rank values are editor previews, never saved allocations.
export const TALENT_DESIGN = {
  "schemaVersion": 1,
  "sourceRevision": "c294f1a8+local-2026-09-26",
  "documentId": "mossvale-talent-2026-09-26-ca9adf64-05ea-4350-9e0c-855cebba9463",
  "title": "Mossvale talent redesign",
  "classes": [
    {
      "id": "Ranger",
      "name": "Ranger",
      "budget": 20,
      "trees": [
        {
          "id": "ranger-marksmanship",
          "name": "Marksmanship",
          "note": "Precision & powerful shots",
          "icon": "bow",
          "talents": [
            {"id":"ranger-1","label":"Steady aim","description":"+2% direct ability damage","notes":"","rankDescriptions":[],"icon":"bow","row":0,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-2","label":"Volley","description":"+2% direct ability damage","notes":"","rankDescriptions":[],"icon":"bow","row":1,"column":1,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":3,"prerequisite":"ranger-1","prerequisiteRank":1},
            {"id":"ranger-3","label":"Twinshot","description":"Basic attacks have a 20% chance to fire a second shot. Bonus shots cannot trigger another Twinshot.","notes":"","rankDescriptions":[],"icon":"spell-twinshot","row":2,"column":2,"maxRank":1,"rank":0,"requiredLevel":16,"requiredBranchPoints":6,"prerequisite":"ranger-2","prerequisiteRank":1},
            {"id":"ranger-marksmanship-1","label":"Draw strength","description":"+2% direct ability damage per rank","notes":"","rankDescriptions":[],"icon":"bow","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-marksmanship-2","label":"Split shafts","description":"+2% instant ability damage per rank","notes":"","rankDescriptions":[],"icon":"bow","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"ranger-marksmanship-1","prerequisiteRank":2},
            {"id":"ranger-marksmanship-3","label":"Steady momentum","description":"Each basic attack that does not Twinshot adds 5 percentage points to the next basic Twinshot chance. Resets after a Twinshot. Rank 2: Each basic attack that does not Twinshot adds 10 percentage points to the next basic Twinshot chance. Resets after a Twinshot.","notes":"","rankDescriptions":["Each basic attack that does not Twinshot adds 5 percentage points to the next basic Twinshot chance. Resets after a Twinshot.","Each basic attack that does not Twinshot adds 10 percentage points to the next basic Twinshot chance. Resets after a Twinshot."],"icon":"spell-twinshot","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"ranger-3","prerequisiteRank":1},
            {"id":"ranger-marksmanship-4","label":"Arrowstorm","description":"Triggering Twinshot increases your attack speed for ten seconds, stacking up to five times. Each trigger refreshes the duration.","notes":"","rankDescriptions":["Each Twinshot grants 5% attack speed for ten seconds, up to 25%.","Each Twinshot grants 10% attack speed for ten seconds, up to 50%."],"icon":"spell-twinshot","row":3,"column":1,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"ranger-marksmanship-3","prerequisiteRank":2},
            {"id":"ranger-marksmanship-5","label":"Perfect Release","description":"+3% instant ability damage per rank","notes":"","rankDescriptions":[],"icon":"bow","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"ranger-3","prerequisiteRank":1},
            {"id":"ranger-marksmanship-6","label":"Double Tap","description":"Draw a heavy shot with a 20% chance to fire twice. A bonus shot has a 20% chance to reset this cooldown and make your next Double Tap instant for ten seconds.","notes":"","rankDescriptions":[],"icon":"spell-twinshot","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":37,"requiredBranchPoints":12,"prerequisite":"ranger-marksmanship-4","prerequisiteRank":2},
            {"id":"custom-542f3ce8-e745-484a-9bc3-cb624415b6ff","label":"Precise Shots","description":"Increases attack speed by 5% per point","notes":"new icon","rankDescriptions":["5% Attack Speed","10% Attack Speed"],"icon":"compass","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":3,"prerequisite":null,"prerequisiteRank":0}
          ]
        },
        {
          "id": "ranger-beastmaster",
          "name": "Beastmaster",
          "note": "Faithful companion",
          "icon": "compass",
          "talents": [
            {"id":"ranger-4","label":"Sure footing","description":"+1 defense","notes":"","rankDescriptions":[],"icon":"shield","row":0,"column":1,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-5","label":"Trail ward","description":"+1 defense · +2 special damage","notes":"","rankDescriptions":[],"icon":"heartroot","row":1,"column":1,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":3,"prerequisite":"ranger-4","prerequisiteRank":1},
            {"id":"ranger-pathfinder-1","label":"Hide padding","description":"+1 defense per rank","notes":"","rankDescriptions":[],"icon":"shield","row":0,"column":2,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-pathfinder-2","label":"Thorn guard","description":"+1 primary damage · +1 special damage per rank","notes":"","rankDescriptions":[],"icon":"volley","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"ranger-pathfinder-1","prerequisiteRank":2},
            {"id":"ranger-pathfinder-3","label":"Rooted stance","description":"+1 defense per rank","notes":"","rankDescriptions":[],"icon":"shield","row":2,"column":0,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"ranger-5","prerequisiteRank":1},
            {"id":"ranger-pathfinder-4","label":"Briar mantle","description":"+1 defense · +1 special damage per rank","notes":"","rankDescriptions":[],"icon":"heartroot","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"ranger-pathfinder-3","prerequisiteRank":2},
            {"id":"ranger-pathfinder-5","label":"Wild reprisal","description":"+1 primary damage · +2 special damage per rank","notes":"","rankDescriptions":[],"icon":"volley","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-pathfinder-6","label":"Combined Assault","description":"You and your companion strike the same target together, each dealing 150% of basic-attack damage. Your companion must be alive and within melee range of the target. 16-second cooldown.","notes":"","rankDescriptions":[],"icon":"spell-combined-assault","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"ranger-everlasting-bond","prerequisiteRank":1},
            {"id":"ranger-beastmaster","label":"Beastmaster","description":"Tame an ordinary creature at or below your level as your permanent combat companion. World bosses and dungeon bosses cannot be tamed. Any healing you receive also heals your companion.","notes":"","rankDescriptions":[],"icon":"spell-tame-beast","row":2,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":6,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-everlasting-bond","label":"Everlasting Bond","description":"Your companion’s basic attacks empower your next basic attack to deal extra damage and heal your companion. This effect does not stack.","notes":"","rankDescriptions":["Your next basic attack deals 10% extra damage and heals your companion for 5% of its maximum health.","Your next basic attack deals 20% extra damage and heals your companion for 10% of its maximum health."],"icon":"spell-tame-beast","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"ranger-beastmaster","prerequisiteRank":1},
            {"id":"custom-f52507bb-80c7-4067-9fa4-0e4beda2f788","label":"Primal Focus","description":"Increases your crit chance by 2.5% per point","notes":"new Icon","rankDescriptions":["2.5% Crit Chance","5% Crit Chance"],"icon":"compass","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":3,"prerequisite":null,"prerequisiteRank":0}
          ]
        },
        {
          "id": "ranger-venom",
          "name": "Venom",
          "note": "Poison & lingering damage",
          "icon": "leaf",
          "talents": [
            {"id":"ranger-survival-1","label":"Serpent Study","description":"+2% poison damage per rank","notes":"","rankDescriptions":[],"icon":"leaf","row":0,"column":2,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-survival-2","label":"Serpent study Surge","description":"+2% poison damage per rank","notes":"","rankDescriptions":[],"icon":"leaf","row":1,"column":1,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"ranger-survival-1","prerequisiteRank":3},
            {"id":"ranger-survival-3","label":"Toxic arrows","description":"Convert 60% of basic-attack damage into poison over four seconds. Reapplying adds all remaining damage to the new poison.","notes":"","rankDescriptions":[],"icon":"spell-venom-detonation","row":2,"column":1,"maxRank":1,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"ranger-survival-2","prerequisiteRank":2},
            {"id":"ranger-survival-4","label":"Venom craft","description":"+2% poison damage per rank","notes":"","rankDescriptions":[],"icon":"leaf","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-survival-5","label":"Venom craft Mastery","description":"+2% damage over time per rank.","notes":"","rankDescriptions":["+2% damage over time.","+4% damage over time."],"icon":"leaf","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"ranger-survival-4","prerequisiteRank":2},
            {"id":"ranger-survival-6","label":"Lingering venom","description":"Toxic Arrows lasts five seconds at rank 1 or six seconds at rank 2. Reapplying preserves all remaining poison damage.","notes":"","rankDescriptions":["Toxic Arrows lasts five seconds. Reapplying still preserves all remaining poison damage.","Toxic Arrows lasts six seconds. Reapplying still preserves all remaining poison damage."],"icon":"spell-venom-detonation","row":2,"column":2,"maxRank":2,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"ranger-survival-3","prerequisiteRank":1},
            {"id":"ranger-survival-7","label":"Lingering venom mastery","description":"+3% poison damage per rank","notes":"","rankDescriptions":[],"icon":"leaf","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-survival-8","label":"Lingering venom surge","description":"+3% damage over time per rank","notes":"","rankDescriptions":[],"icon":"leaf","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":9,"prerequisite":null,"prerequisiteRank":0},
            {"id":"ranger-survival-9","label":"Venom Detonation","description":"Consume your poisons on enemies within twelve meters, immediately dealing their remaining damage, increased by 5% for each different damage-over-time effect of yours on that enemy.","notes":"","rankDescriptions":[],"icon":"spell-venom-detonation","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":37,"requiredBranchPoints":12,"prerequisite":"ranger-survival-6","prerequisiteRank":2},
            {"id":"custom-6805d983-80b3-479e-b8c4-70793d850f4e","label":"Natural Gift","description":"Increases All damage by 2% per point","notes":"new icon","rankDescriptions":["2% All damage","4% All damage"],"icon":"compass","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":3,"prerequisite":null,"prerequisiteRank":0}
          ]
        }
      ]
    },
    {
      "id": "Knight",
      "name": "Knight",
      "budget": 20,
      "trees": [
        {
          "id": "knight-vanguard",
          "name": "Vanguard",
          "note": "Steel & sweeping attacks",
          "icon": "sword",
          "talents": [
            {"id":"knight-1","label":"Keen edge","description":"+2% physical ability damage","notes":"","rankDescriptions":[],"icon":"sword","row":0,"column":1,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-2","label":"Cleave","description":"+2% physical ability damage","notes":"","rankDescriptions":[],"icon":"sword","row":1,"column":2,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":1,"prerequisite":"knight-1","prerequisiteRank":1},
            {"id":"knight-3","label":"Sunbreaker","description":"+2.5% Crit Chance","notes":"new icon","rankDescriptions":["+2.5% Crit Chance","+5% Crit Chance"],"icon":"compass","row":1,"column":1,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":2,"prerequisite":"knight-2","prerequisiteRank":1},
            {"id":"knight-vanguard-1","label":"Weapon drills","description":"+2% physical ability damage per rank","notes":"","rankDescriptions":[],"icon":"sword","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-vanguard-2","label":"Sweeping force","description":"+2% physical ability damage per rank","notes":"","rankDescriptions":[],"icon":"sword","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"knight-vanguard-1","prerequisiteRank":2},
            {"id":"knight-vanguard-3","label":"Tempered edge","description":"+3% physical ability damage per rank","notes":"","rankDescriptions":[],"icon":"sword","row":2,"column":2,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"knight-2","prerequisiteRank":1},
            {"id":"knight-vanguard-4","label":"Crushing blows","description":"+3% physical ability damage per rank","notes":"","rankDescriptions":[],"icon":"sword","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"knight-vanguard-3","prerequisiteRank":2},
            {"id":"knight-vanguard-5","label":"Steel tempest","description":"+3% physical ability damage per rank","notes":"","rankDescriptions":[],"icon":"sword","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-vanguard-6","label":"Powerful Throw","description":"Hold to charge your throw, then throw your shield, bouncing on enemies. You can pick up the shield to reduce the next throw's charge time","notes":"","rankDescriptions":[],"icon":"spell-shield-toss","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"custom-3447ea15-8441-4f2b-b8e3-a322be986bd3","prerequisiteRank":2},
            {"id":"custom-ece9586f-85c4-482f-bd43-f1869b5d4a02","label":"Wide Swing","description":"Your basic attacks automatically cleave to a second nearby enemy","notes":"new icon","rankDescriptions":[],"icon":"compass","row":2,"column":0,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":5,"prerequisite":null,"prerequisiteRank":0},
            {"id":"custom-3447ea15-8441-4f2b-b8e3-a322be986bd3","label":"Fine Cuts","description":"Increases the damage and targets your auto attacks cleave","notes":"new icon","rankDescriptions":["15% damage, 2 targets","30% damage, 3 targets"],"icon":"compass","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-ece9586f-85c4-482f-bd43-f1869b5d4a02","prerequisiteRank":1}
          ]
        },
        {
          "id": "knight-sentinel",
          "name": "Sentinel",
          "note": "Stand against the darkness",
          "icon": "shield",
          "talents": [
            {"id":"knight-4","label":"Brace","description":"+1 defense","notes":"","rankDescriptions":[],"icon":"shield","row":0,"column":1,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-5","label":"Iron resolve","description":"+1 defense · +2 special damage","notes":"","rankDescriptions":[],"icon":"heartroot","row":1,"column":2,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":1,"prerequisite":"knight-4","prerequisiteRank":1},
            {"id":"knight-6","label":"Unbroken","description":"+2 defense · +2 primary damage","notes":"","rankDescriptions":[],"icon":"shield","row":1,"column":1,"maxRank":1,"rank":0,"requiredLevel":3,"requiredBranchPoints":2,"prerequisite":"knight-5","prerequisiteRank":1},
            {"id":"knight-sentinel-1","label":"Shield training","description":"+1 defense per rank","notes":"","rankDescriptions":[],"icon":"shield","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-sentinel-2","label":"Defiant strike","description":"+1 primary damage · +1 special damage per rank","notes":"","rankDescriptions":[],"icon":"whirlwind","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"knight-sentinel-1","prerequisiteRank":2},
            {"id":"knight-sentinel-3","label":"Layered mail","description":"+1 defense per rank","notes":"","rankDescriptions":[],"icon":"shield","row":2,"column":0,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"knight-5","prerequisiteRank":1},
            {"id":"knight-sentinel-4","label":"Iron bulwark","description":"5% Increased health per rank","notes":"","rankDescriptions":["5% Health Increase","10% Health Increase"],"icon":"heartroot","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"knight-sentinel-3","prerequisiteRank":2},
            {"id":"knight-sentinel-5","label":"Unyielding force","description":"+1 primary damage · +2 special damage per rank","notes":"","rankDescriptions":[],"icon":"whirlwind","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-sentinel-6","label":"Adamant Guardian","description":"Brace yourself, forcing nearby enemies to attack you, reducing incoming damage by 40% and instantly counter-attacking enemies.","notes":"1 second internal cooldown on the counter-attack","rankDescriptions":[],"icon":"spell-fortress","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"custom-69e5775e-3a57-40b0-b032-0f2aa4a125e8","prerequisiteRank":2},
            {"id":"custom-02723b73-c611-4fe1-895d-661544a98cdb","label":"Guard","description":"Raise your shield to absorb incoming hits, reducing damage and reflecting damage back at attackers, generating extra threat","notes":"new icon","rankDescriptions":[],"icon":"compass","row":2,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":5,"prerequisite":null,"prerequisiteRank":0},
            {"id":"custom-69e5775e-3a57-40b0-b032-0f2aa4a125e8","label":"Hold the Line","description":"Damage you absorb increase the damage you reflect, and makes it shatter for area damage","notes":"new icon","rankDescriptions":["25% Area damage 5% absorb added to damage","50% Area damage 10% absorb added to damage"],"icon":"compass","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-02723b73-c611-4fe1-895d-661544a98cdb","prerequisiteRank":1}
          ]
        },
        {
          "id": "knight-warlord",
          "name": "Warlord",
          "note": "Command the battlefield",
          "icon": "crown",
          "talents": [
            {"id":"knight-warlord-1","label":"Battle rhythm","description":"+2% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":0,"column":1,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-warlord-2","label":"Commanding force","description":"+2% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"knight-warlord-1","prerequisiteRank":3},
            {"id":"knight-warlord-3","label":"Veteran’s guard","description":"+3% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":2,"column":2,"maxRank":2,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"knight-warlord-2","prerequisiteRank":2},
            {"id":"knight-warlord-4","label":"Heavy strikes","description":"+2% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-warlord-5","label":"Siegebreaker","description":"+2% All Damage per rank","notes":"","rankDescriptions":["+2% All Damage","+4% All Damage"],"icon":"crown","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"knight-warlord-4","prerequisiteRank":2},
            {"id":"knight-warlord-6","label":"Battleplate","description":"+3% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":1,"column":1,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-warlord-7","label":"Conqueror’s edge","description":"+3% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":null,"prerequisiteRank":0},
            {"id":"knight-warlord-8","label":"War standard","description":"+3% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"crown","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"knight-warlord-3","prerequisiteRank":2},
            {"id":"knight-warlord-9","label":"Lord of battle","description":"Mark nearby enemies and allies, causing enemies hit to take extra damage and allies hit to get healed","notes":"","rankDescriptions":[],"icon":"spell-last-bastion","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"custom-cdf4bd32-3754-4628-af93-8ba132dc76a0","prerequisiteRank":2},
            {"id":"custom-4549ff51-1e44-4747-b1f8-575f817b2f08","label":"Courageous Call","description":"Let out a shout, inspiring allies to fight with more vigor.","notes":"new icon","rankDescriptions":["20% more damage"],"icon":"compass","row":2,"column":0,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":5,"prerequisite":null,"prerequisiteRank":0},
            {"id":"custom-cdf4bd32-3754-4628-af93-8ba132dc76a0","label":"Into the Fray","description":"Courage Call also grants allies increased crit chance","notes":"new icon","rankDescriptions":["7% Crit Chance","15% Crit Chance"],"icon":"compass","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-4549ff51-1e44-4747-b1f8-575f817b2f08","prerequisiteRank":1}
          ]
        }
      ]
    },
    {
      "id": "Mage",
      "name": "Mage",
      "budget": 20,
      "trees": [
        {
          "id": "mage-fire",
          "name": "Fire",
          "note": "Flame & sustained burning",
          "icon": "ember",
          "talents": [
            {"id":"mage-1","label":"Kindling","description":"+2% Fire damage","notes":"","rankDescriptions":[],"icon":"ember","row":0,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"mage-2","label":"Flame study","description":"+2% Fire damage","notes":"","rankDescriptions":[],"icon":"ember","row":1,"column":1,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":1,"prerequisite":"mage-1","prerequisiteRank":1},
            {"id":"mage-3","label":"Burning","description":"Damaging fire spells grant one Heat for six seconds, up to ten. Each Heat increases spell cast speed and all damage-over-time tick rates by 3%.","notes":"","rankDescriptions":[],"icon":"spell-combustion","row":2,"column":1,"maxRank":1,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"mage-2","prerequisiteRank":1},
            {"id":"mage-spellfire-1","label":"Kindling mastery","description":"+2% Fire damage per rank","notes":"","rankDescriptions":[],"icon":"ember","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"mage-spellfire-2","label":"Flame study surge","description":"+2% damage over time per rank","notes":"","rankDescriptions":[],"icon":"ember","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"mage-spellfire-1","prerequisiteRank":2},
            {"id":"mage-spellfire-3","label":"Living flame","description":"Your damage-over-time ticks also grant one Heat and refresh Burning. Rank 2: Your damage-over-time ticks also grant two Heat and refresh Burning.","notes":"","rankDescriptions":["Your damage-over-time ticks also grant one Heat and refresh Burning.","Your damage-over-time ticks also grant two Heat and refresh Burning."],"icon":"spell-combustion","row":2,"column":0,"maxRank":2,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"mage-3","prerequisiteRank":1},
            {"id":"mage-spellfire-4","label":"Living flame mastery","description":"+3% Fire damage per rank","notes":"","rankDescriptions":[],"icon":"ember","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"mage-spellfire-3","prerequisiteRank":2},
            {"id":"mage-spellfire-5","label":"Living flame surge","description":"+3% damage over time per rank","notes":"","rankDescriptions":[],"icon":"ember","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"mage-3","prerequisiteRank":1},
            {"id":"mage-spellfire-6","label":"Combustion","description":"Prepare a massive fire strike that leaves a powerful six-second burn. Burning heat speeds up the cast and its damage-over-time ticks.","notes":"","rankDescriptions":[],"icon":"spell-combustion","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":37,"requiredBranchPoints":12,"prerequisite":"mage-spellfire-5","prerequisiteRank":2},
            {"id":"custom-beae5a3c-4e83-48c4-82f1-bfa05f17d045","label":"Heated Haste","description":"Increases cast speed by 2% per point","notes":"new icon","rankDescriptions":["2% cast speed","4% cast speed"],"icon":"compass","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":3,"prerequisite":null,"prerequisiteRank":0}
          ]
        },
        {
          "id": "mage-arcane",
          "name": "Arcane",
          "note": "Concentration & arcane power",
          "icon": "beacon",
          "talents": [
            {"id":"mage-4","label":"Arcane focus","description":"+2% Arcane damage","notes":"","rankDescriptions":[],"icon":"beacon","row":0,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"mage-5","label":"Ley study","description":"+2% Arcane damage","notes":"","rankDescriptions":[],"icon":"beacon","row":1,"column":1,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":1,"prerequisite":"mage-4","prerequisiteRank":1},
            {"id":"mage-6","label":"Arcane Echo","description":"Damaging arcane spells have a 15% chance to launch an Arcane Missile. These missiles can repeat, up to sixteen echoes per chain.","notes":"","rankDescriptions":[],"icon":"spell-arcane-volley","row":2,"column":1,"maxRank":1,"rank":0,"requiredLevel":16,"requiredBranchPoints":6,"prerequisite":"mage-5","prerequisiteRank":1},
            {"id":"mage-warding-1","label":"Arcane focus mastery","description":"+2% Arcane damage per rank","notes":"","rankDescriptions":[],"icon":"beacon","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"mage-warding-2","label":"Ley study surge","description":"+2% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"beacon","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"mage-warding-1","prerequisiteRank":2},
            {"id":"mage-warding-3","label":"Resonance","description":"Arcane Echo chance increases to 20%, including repeat missiles. Rank 2: Arcane Echo chance increases to 25%, including repeat missiles.","notes":"","rankDescriptions":["Arcane Echo chance increases to 20%, including repeat missiles.","Arcane Echo chance increases to 25%, including repeat missiles."],"icon":"spell-arcane-volley","row":2,"column":0,"maxRank":2,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"mage-6","prerequisiteRank":1},
            {"id":"mage-warding-4","label":"Astral power mastery","description":"+3% Arcane damage per rank","notes":"","rankDescriptions":[],"icon":"beacon","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"mage-warding-3","prerequisiteRank":2},
            {"id":"mage-warding-5","label":"Astral power surge","description":"+3% cast and channel damage per rank","notes":"","rankDescriptions":[],"icon":"beacon","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"mage-6","prerequisiteRank":1},
            {"id":"mage-warding-6","label":"Arcane Volley","description":"Fire seven Arcane Missiles divided among up to seven enemies. One missile guarantees an Arcane Echo; every other hit and echo uses your normal repeat chance. This volley and its echoes deal 40% damage against players.","notes":"","rankDescriptions":[],"icon":"spell-arcane-volley","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":37,"requiredBranchPoints":12,"prerequisite":"mage-warding-5","prerequisiteRank":2},
            {"id":"custom-e1f80f80-e98d-4bdc-8fda-d4dee64dfd2a","label":"Magic Focus","description":"Increases magic damage by 2% per point","notes":"new icon","rankDescriptions":["2% Magic Damage","4% Magic Damage"],"icon":"compass","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0}
          ]
        },
        {
          "id": "mage-frost",
          "name": "Frost",
          "note": "Chill & shatter combinations",
          "icon": "frost",
          "talents": [
            {"id":"mage-frostweaving-1","label":"Ice shaping","description":"+2% Frost damage per rank","notes":"","rankDescriptions":[],"icon":"frost","row":0,"column":2,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"mage-frostweaving-2","label":"Winter study","description":"+2% Frost damage per rank","notes":"","rankDescriptions":[],"icon":"frost","row":1,"column":1,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"mage-frostweaving-1","prerequisiteRank":3},
            {"id":"mage-frostweaving-3","label":"Chilled","description":"Damaging frost spells Chill targets for four seconds, slowing them by 20%. Ice Lance deals triple damage to Chilled targets and resets its cooldown when it hits them.","notes":"","rankDescriptions":[],"icon":"spell-shatter","row":2,"column":1,"maxRank":1,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"mage-frostweaving-2","prerequisiteRank":2},
            {"id":"mage-frostweaving-4","label":"Ice shaping mastery","description":"+2% Frost damage per rank","notes":"","rankDescriptions":[],"icon":"frost","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"mage-frostweaving-5","label":"Winter study surge","description":"+2% direct damage against slowed enemies per rank","notes":"","rankDescriptions":[],"icon":"frost","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"mage-frostweaving-4","prerequisiteRank":2},
            {"id":"mage-frostweaving-6","label":"Deep chill","description":"Chilled targets take 5% more damage from all your frost spells. Rank 2: Chilled targets take 10% more damage from all your frost spells.","notes":"","rankDescriptions":["Chilled targets take 5% more damage from all your frost spells.","Chilled targets take 10% more damage from all your frost spells."],"icon":"spell-shatter","row":2,"column":0,"maxRank":2,"rank":0,"requiredLevel":16,"requiredBranchPoints":5,"prerequisite":"mage-frostweaving-3","prerequisiteRank":1},
            {"id":"mage-frostweaving-7","label":"Shattering cold mastery","description":"+3% Frost damage per rank","notes":"","rankDescriptions":[],"icon":"frost","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"mage-frostweaving-6","prerequisiteRank":2},
            {"id":"mage-frostweaving-8","label":"Shattering cold surge","description":"+3% direct damage against slowed enemies per rank","notes":"","rankDescriptions":[],"icon":"frost","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"mage-frostweaving-3","prerequisiteRank":1},
            {"id":"mage-frostweaving-9","label":"Shatter","description":"Consume Chilled effects within eighteen meters, immediately striking those enemies with frost and making each explode onto enemies within three meters.","notes":"new icon","rankDescriptions":[],"icon":"spell-shatter","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":37,"requiredBranchPoints":12,"prerequisite":"mage-frostweaving-8","prerequisiteRank":2},
            {"id":"custom-e591c589-f537-4690-9e68-82a8534027e1","label":"Sharp Mind","description":"Increases your crit chance by 2.5% per point","notes":"new icon","rankDescriptions":["2.5% Crit chance","5% Crit chance"],"icon":"compass","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":3,"prerequisite":null,"prerequisiteRank":0}
          ]
        }
      ]
    },
    {
      "id": "Cleric",
      "name": "Cleric",
      "budget": 20,
      "trees": [
        {
          "id": "cleric-radiance",
          "name": "Radiance",
          "note": "Healing & renewal",
          "icon": "cleric-heal",
          "talents": [
            {"id":"cleric-1","label":"Holy focus","description":"+2% healing","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":0,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-2","label":"Bright prayer","description":"+2% healing","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":1,"column":2,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":1,"prerequisite":"cleric-1","prerequisiteRank":1},
            {"id":"cleric-3","label":"Lightbearer","description":"+3% healing","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":2,"column":2,"maxRank":1,"rank":0,"requiredLevel":3,"requiredBranchPoints":2,"prerequisite":"cleric-2","prerequisiteRank":1},
            {"id":"cleric-radiance-1","label":"Dawn study","description":"+2% healing per rank","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-radiance-2","label":"Healing light","description":"Your heals send out a small pulse for a percentage of the initial heal","notes":"new icon","rankDescriptions":["5% Pulse","10% Pulse"],"icon":"cleric-heal","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"cleric-radiance-1","prerequisiteRank":2},
            {"id":"cleric-radiance-3","label":"Luminous will","description":"+3% healing per rank","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":1,"column":1,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"cleric-2","prerequisiteRank":1},
            {"id":"cleric-radiance-4","label":"Bountiful grace","description":"+3% healing per rank","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":9,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-radiance-5","label":"Sunlit spirit","description":"+3% healing per rank","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"cleric-3","prerequisiteRank":1},
            {"id":"cleric-radiance-6","label":"Beacon of hope","description":"+15% healing","notes":"","rankDescriptions":[],"icon":"cleric-heal","row":4,"column":2,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"cleric-radiance-5","prerequisiteRank":2},
            {"id":"custom-ead2acc1-1d80-43e6-bdac-678ed0451f9c","label":"Edict of Light","description":"Your healing spells mark the target with an Edict, When next damaged or healed the edict is activated, causing additional healing\n","notes":"","rankDescriptions":[],"icon":"spell-edict-of-light","row":2,"column":0,"maxRank":1,"rank":0,"requiredLevel":6,"requiredBranchPoints":6,"prerequisite":null,"prerequisiteRank":0},
            {"id":"custom-01b6f08c-bfb2-44b9-a294-25e287be9b7d","label":"Bouncing Edicts","description":"Edicts triggered can chain to other nearby entities, can chain off of itself up to twice","notes":"","rankDescriptions":["7% Chance to Chain","15% Chance to Chain"],"icon":"spell-bouncing-edicts","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-ead2acc1-1d80-43e6-bdac-678ed0451f9c","prerequisiteRank":1},
            {"id":"custom-bfeda156-9c0b-4fd5-80ab-2ddf772cff28","label":"Edict of the Dawn","description":"Place an extra powerful Edict on an ally, lasting 12 seconds and healing over time. When the affected target is hit they send out a healing pulse","notes":"","rankDescriptions":[],"icon":"spell-edict-of-the-dawn","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-01b6f08c-bfb2-44b9-a294-25e287be9b7d","prerequisiteRank":1}
          ]
        },
        {
          "id": "cleric-devotion",
          "name": "Devotion",
          "note": "Protective prayers",
          "icon": "cleric-shield",
          "talents": [
            {"id":"cleric-4","label":"Merciful ward","description":"+2% shield absorption · +1 defense","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":0,"column":2,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-5","label":"Steady faith","description":"+2% shield absorption · +1 defense","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":1,"column":2,"maxRank":1,"rank":0,"requiredLevel":2,"requiredBranchPoints":1,"prerequisite":"cleric-4","prerequisiteRank":1},
            {"id":"cleric-6","label":"Sanctuary","description":"+3% shield absorption · +2 defense","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":2,"column":2,"maxRank":1,"rank":0,"requiredLevel":3,"requiredBranchPoints":2,"prerequisite":"cleric-5","prerequisiteRank":1},
            {"id":"cleric-devotion-1","label":"Sacred resolve","description":"+2% shield absorption · +1 defense per rank","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-devotion-2","label":"Blessed Armor","description":"Your heals and shields increase your target's defence by 2 for 5 seconds per rank ","notes":"","rankDescriptions":["2 defense for 5 seconds","4 defense for 5 seconds"],"icon":"cleric-shield","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"cleric-devotion-1","prerequisiteRank":2},
            {"id":"cleric-devotion-3","label":"Woven blessings","description":"+3% shield absorption · +1 defense per rank","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":1,"column":1,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"cleric-5","prerequisiteRank":1},
            {"id":"cleric-devotion-4","label":"Protective faith","description":"+3% shield absorption · +1 defense per rank","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":9,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-devotion-5","label":"Radiant aegis","description":"+3% shield absorption per rank","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"cleric-6","prerequisiteRank":1},
            {"id":"cleric-devotion-6","label":"Unbroken devotion","description":"+15% shield absorption · +2 defense","notes":"","rankDescriptions":[],"icon":"cleric-shield","row":4,"column":2,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"cleric-devotion-5","prerequisiteRank":2},
            {"id":"custom-35d1bf12-1974-4e4c-9e9e-2118d3b6595d","label":"Edict of Protection","description":"Your defensive spells mark the target with an Edict, the next time they're hit they get a small absorb shield and damage their attacker.","notes":"","rankDescriptions":[],"icon":"spell-edict-of-protection","row":2,"column":0,"maxRank":1,"rank":0,"requiredLevel":6,"requiredBranchPoints":6,"prerequisite":null,"prerequisiteRank":0},
            {"id":"custom-08e24f9e-783a-461f-873d-4af7a3ecaed5","label":"Blanket Edicts","description":"Your Edicts spread weaker version on trigger.","notes":"","rankDescriptions":["10% power, 1 target","20% power, 3 targets"],"icon":"spell-blanket-edicts","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-35d1bf12-1974-4e4c-9e9e-2118d3b6595d","prerequisiteRank":1},
            {"id":"custom-b6b3d821-bdfa-494e-9ad5-c4c00f4f88d9","label":"Titan's Edict","description":"Mark your ally with a Titan's Edict, granting them a large absorb shield that reflects damage. can be affected by other Edict talents.","notes":"","rankDescriptions":[],"icon":"spell-titans-edict","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-08e24f9e-783a-461f-873d-4af7a3ecaed5","prerequisiteRank":1}
          ]
        },
        {
          "id": "cleric-judgment",
          "name": "Judgment",
          "note": "Righteous holy damage",
          "icon": "cleric-smite",
          "talents": [
            {"id":"cleric-judgment-1","label":"Zealous strike","description":"+2% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":0,"column":2,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-judgment-2","label":"Searing word","description":"+2% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":1,"column":2,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"cleric-judgment-1","prerequisiteRank":3},
            {"id":"cleric-judgment-3","label":"Pilgrim guard","description":"+3% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":2,"column":2,"maxRank":2,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"cleric-judgment-2","prerequisiteRank":2},
            {"id":"cleric-judgment-4","label":"Holy fire","description":"+2% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":0,"column":0,"maxRank":3,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-judgment-5","label":"Righteous force","description":"+2.5% Crit Chance per rank","notes":"new icon","rankDescriptions":["+2.5% Crit Chance","+5% Crit Chance"],"icon":"cleric-smite","row":1,"column":0,"maxRank":2,"rank":0,"requiredLevel":3,"requiredBranchPoints":3,"prerequisite":"cleric-judgment-4","prerequisiteRank":2},
            {"id":"cleric-judgment-6","label":"Sanctified armor","description":"+3% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":1,"column":1,"maxRank":3,"rank":0,"requiredLevel":6,"requiredBranchPoints":5,"prerequisite":"cleric-judgment-2","prerequisiteRank":2},
            {"id":"cleric-judgment-7","label":"Judgment of dawn","description":"+3% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":3,"column":0,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":9,"prerequisite":null,"prerequisiteRank":0},
            {"id":"cleric-judgment-8","label":"Resolute spirit","description":"+3% Holy damage per rank","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":3,"column":2,"maxRank":2,"rank":0,"requiredLevel":9,"requiredBranchPoints":8,"prerequisite":"cleric-judgment-3","prerequisiteRank":2},
            {"id":"cleric-judgment-9","label":"Herald of light","description":"+15% Holy damage","notes":"","rankDescriptions":[],"icon":"cleric-smite","row":4,"column":2,"maxRank":1,"rank":0,"requiredLevel":13,"requiredBranchPoints":12,"prerequisite":"cleric-judgment-8","prerequisiteRank":2},
            {"id":"custom-221f95e2-73d4-4747-b9e0-5c08fa50fc86","label":"Edict of Harm","description":"Your damaging spells mark the target with an Edict, the next time they take damage the Edict is triggered for extra damage","notes":"","rankDescriptions":[],"icon":"spell-edict-of-harm","row":2,"column":0,"maxRank":1,"rank":0,"requiredLevel":6,"requiredBranchPoints":6,"prerequisite":null,"prerequisiteRank":0},
            {"id":"custom-d07de059-ed1c-4417-b30f-17b9e3a3cb8f","label":"Renewable Edict","description":"Your Edicts have a chance to reapply themselves","notes":"","rankDescriptions":["5% Chance","10% Chance"],"icon":"spell-renewable-edict","row":2,"column":1,"maxRank":2,"rank":0,"requiredLevel":6,"requiredBranchPoints":0,"prerequisite":"custom-221f95e2-73d4-4747-b9e0-5c08fa50fc86","prerequisiteRank":1},
            {"id":"custom-c21f4d69-ac3f-4107-8a09-c4c2c96614d9","label":"Eternal Edict","description":"All your current Edicts lasts for 8 seconds and can be repeatedly activated","notes":"","rankDescriptions":[],"icon":"spell-eternal-edict","row":4,"column":1,"maxRank":1,"rank":0,"requiredLevel":1,"requiredBranchPoints":0,"prerequisite":"custom-d07de059-ed1c-4417-b30f-17b9e3a3cb8f","prerequisiteRank":1}
          ]
        }
      ]
    }
  ]
} as const;
