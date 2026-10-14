// OB3.1 illustrative onboarding data. Team names/colors mirror scripts/catalogue/team-registrations.json;
// player names come from the bundled 2026/27 roster snapshot (dist/rosters.js). Static by design:
// no crests, kits, photos, provider media or network reads. tests/onboarding-ui.test.mjs checks both sources.
export const showcaseTeams = {
  galatasaray:{name:'Galatasaray',short:'GS',primary:'#a51935',secondary:'#efb62a'},
  fenerbahce:{name:'Fenerbahçe',short:'FB',primary:'#19294d',secondary:'#f3d233'},
  besiktas:{name:'Beşiktaş',short:'BJK',primary:'#222222',secondary:'#eeeeee'},
  trabzonspor:{name:'Trabzonspor',short:'TS',primary:'#702039',secondary:'#8cc1dc'},
  samsunspor:{name:'Samsunspor',short:'SAM',primary:'#ca303a',secondary:'#eeeeee'},
  basaksehir:{name:'Başakşehir',short:'İBF',primary:'#ed7835',secondary:'#213a63'},
  goztepe:{name:'Göztepe',short:'GÖZ',primary:'#bb2039',secondary:'#edc932'},
  konyaspor:{name:'Konyaspor',short:'KON',primary:'#23855c',secondary:'#ffffff'},
  kasimpasa:{name:'Kasımpaşa',short:'KAS',primary:'#173c74',secondary:'#ffffff'},
  alanyaspor:{name:'Alanyaspor',short:'ALA',primary:'#ef802b',secondary:'#228756'},
  kocaelispor:{name:'Kocaelispor',short:'KOC',primary:'#148255',secondary:'#242b28'},
  eyupspor:{name:'Eyüpspor',short:'EYP',primary:'#713576',secondary:'#e6be42'},
};

// Stüdyo: two teams on one pitch. Labels only on the players the drawn arrows refer to.
export const studioShowcase = {
  home:'galatasaray',away:'fenerbahce',
  homePlayers:[[6,50],[20,26],[20,74],[31,42,'Torreira'],[31,60],[42,30,'Osimhen'],[42,72]],
  awayPlayers:[[94,50],[80,28],[80,72,'Škriniar'],[68,46],[64,64]],
};

// Taktik Tahtası: one team in 4-3-3, a substitution and two bench players.
export const boardShowcase = {
  team:'trabzonspor',formation:'4–3–3',
  players:[
    {number:24,name:'Onana',full:'André Onana',x:50,y:90},
    {number:19,name:'Eskihellaç',full:'Mustafa Eskihellaç',x:15,y:70},{number:27,name:'Nwaiwu',full:'Chibuike Nwaiwu',x:38,y:74},
    {number:15,name:'Savić',full:'Stefan Savić',x:62,y:74},{number:20,name:'W. Pina',full:'Wagner Pina',x:85,y:70},
    {number:8,name:'Bouchouari',full:'Benjamin Bouchouari',x:26,y:49},{number:17,name:'Malinovsky',full:'Ruslan Malinovsky',x:50,y:54},
    {number:7,name:'Muçi',full:'Ernest Muçi',x:74,y:49},
    {number:58,name:'Şimşir',full:'Aral Şimşir',x:18,y:23},{number:9,name:'Franculino',full:'Franculino',x:50,y:15,out:true},
    {number:10,name:'Salah',full:'Mohamed Salah',x:82,y:23},
  ],
  substitution:{out:{number:9,name:'Franculino'},in:{number:30,name:'Paul Onuachu'}},
  bench:[{number:11,name:'Ozan Tufan'},{number:55,name:'Sidny Lopes Cabral'}],
};

// Maçlar: fixture cards (no dates or scores) and one opened match with line-up excerpts.
export const matchesShowcase = {
  fixtures:[['galatasaray','fenerbahce','19:00'],['besiktas','trabzonspor','20:00',true],['samsunspor','basaksehir','20:00'],['goztepe','konyaspor','20:00'],['kasimpasa','alanyaspor','20:00'],['kocaelispor','eyupspor','20:00']],
  detail:{home:'besiktas',away:'trabzonspor',
    homeLineup:[[1,'Nübel','Alexander Nübel'],[53,'Topçu','Emirhan Topçu'],[10,'Kökcü','Orkun Kökcü'],[28,'Vlahović','Dušan Vlahović']],
    awayLineup:[[24,'Onana','André Onana'],[15,'Savić','Stefan Savić'],[17,'Malinovsky','Ruslan Malinovsky'],[10,'Salah','Mohamed Salah']]},
};

// Haftanın İlk 11'i: a mixed-club 4-3-3 example and the player-selection list.
export const weeklyShowcase = {
  season:'2026/27',
  players:[
    {team:'fenerbahce',name:'Ederson',full:'Ederson',x:50,y:88},
    {team:'trabzonspor',name:'Eskihellaç',full:'Mustafa Eskihellaç',x:14,y:65},{team:'fenerbahce',name:'Škriniar',full:'Milan Škriniar',x:38,y:69},
    {team:'besiktas',name:'Topçu',full:'Emirhan Topçu',x:62,y:69},{team:'besiktas',name:'Murillo',full:'Amir Murillo',x:86,y:65},
    {team:'galatasaray',name:'Torreira',full:'Lucas Torreira',x:24,y:43},{team:'fenerbahce',name:'Kanté',full:"N'Golo Kanté",x:50,y:47},
    {team:'besiktas',name:'Kökcü',full:'Orkun Kökcü',x:76,y:43},
    {team:'besiktas',name:'Trossard',full:'Leandro Trossard',x:18,y:18},{team:'galatasaray',name:'Osimhen',full:'Victor Osimhen',x:50,y:13},
    {team:'trabzonspor',name:'Salah',full:'Mohamed Salah',x:82,y:18},
  ],
  picker:[{team:'galatasaray',name:'Victor Osimhen',added:true},{team:'fenerbahce',name:'Vedat Muriqi'},{team:'trabzonspor',name:'Franculino'},{team:'besiktas',name:'Dušan Vlahović'}],
};
