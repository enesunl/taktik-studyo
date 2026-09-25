# BSD Catalogue Compatibility Audit — D1

Observed: 2026-09-24T22:01:26.713Z (UTC). Read-only live BSD audit; no database calls or product changes.

Local observation date: **25 September 2026, Europe/Istanbul**. The initial full run and the bounded detailed-role follow-up are both recorded below; the complete task used **78 authenticated BSD data-API GETs**, with **0 failed requests and 0 automatic retries**.

## 1. Executive summary

Live scoped team set: **18**. Confirmed mappings: **18/18**. Successful squad/detail pairs: **18/18**. BSD unique players: **543** (543 squad rows). Legacy: **539**. High-confidence identity proposals: **359 (66.60%)**; medium: **88 (16.33%)**. This is compatibility evidence, not permission or implementation of migration.

Provider IDs remain external mappings. Keep generic jersey rendering; no media downloaded.

## 2. Actual BSD schemas observed

Galatasaray team detail (live; field names/types only):

| Observed field | Types |
| --- | --- |
| $ | object |
| $.id | number |
| $.name | string |
| $.short_name | string |
| $.country | string |
| $.venue_id | number |

Galatasaray squad (live):

| Observed field | Types |
| --- | --- |
| $ | object |
| $.team_id | number |
| $.count | number |
| $.players | array |
| $.players[] | object |
| $.players[].id | number |
| $.players[].name | string |
| $.players[].short_name | string |
| $.players[].position | string |
| $.players[].jersey_number | number |
| $.players[].nationality | string |
| $.players[].date_of_birth | string |
| $.players[].availability | string |
| $.players[].injury_type | string |
| $.players[].injury_expected_return | null / string |

Across all successful squads, observed player fields: `availability`, `date_of_birth`, `id`, `injury_expected_return`, `injury_type`, `jersey_number`, `name`, `nationality`, `position`, `short_name`.

| Player detail sample | Broad position | Observed fields |
| --- | --- | --- |
| Arda Yılmaz | G | attributes, availability, contract_until, current_team, current_team_id, date_of_birth, height_cm, id, injury_expected_return, injury_risk, injury_type, jersey_number, market_value_eur, name, national_team, national_team_id, nationality, position, potential, preferred_foot, rating, short_name, specific_position, strengths, wage_eur_annual, weaknesses, weight_kg |
| El Chadaille Bitshiabu | D | attributes, availability, contract_until, current_team, current_team_id, date_of_birth, height_cm, id, injury_expected_return, injury_risk, injury_type, jersey_number, market_value_eur, name, national_team, national_team_id, nationality, position, potential, preferred_foot, rating, short_name, specific_position, strengths, wage_eur_annual, weaknesses, weight_kg |
| Eyüp Aydın | M | attributes, availability, contract_until, current_team, current_team_id, date_of_birth, height_cm, id, injury_expected_return, injury_risk, injury_type, jersey_number, market_value_eur, name, national_team, national_team_id, nationality, position, potential, preferred_foot, rating, short_name, specific_position, strengths, wage_eur_annual, weaknesses, weight_kg |
| Can Armando Güner | F | attributes, availability, contract_until, current_team, current_team_id, date_of_birth, height_cm, id, injury_expected_return, injury_risk, injury_type, jersey_number, market_value_eur, name, national_team, national_team_id, nationality, position, potential, preferred_foot, rating, short_name, specific_position, strengths, wage_eur_annual, weaknesses, weight_kg |

Team detail union: country, id, name, short_name, venue_id.

Team league/season association is established by the filtered team-set request and independently checked season fixtures, not invented per-detail fields.

Media field present: team no; squad no; sampled player details no. No media values/URLs retained in this report.

| Requested capability | Actual response evidence |
| --- | --- |
| Team ID / name / short name / country | Present in team detail |
| Team colors | Absent from all 18 team details, despite the documentation's general description |
| League / season on team detail | Absent; association independently verified through filtered team list and season events |
| Player ID / name / shirt number / broad position | Present in squad schema; some numbers are null/unusable, as quantified below |
| Detailed player position | Absent in squad; `specific_position` present in player detail; bounded value audit in section 8 |
| Nationality / birth date | `nationality`, `date_of_birth` present; no separate squad age field observed |
| Availability / injury / return date | `availability`, `injury_type`, `injury_expected_return` present; not an independently verified fitness assessment |
| Separate squad-registration status | Not observed in the squad response |
| Captain flag | Not observed in the squad response or sampled player details |
| Starter / bench flag on current squad | Not observed; starter/substitute lists come from match-specific lineup resources instead |

Raw team/player JSON was retained only in process memory. Schema field lists and selected comparison facts are the audit output; full provider response bodies were not persisted.

## 3. Süper Lig team coverage

GET teams/?league_id=11&season_id=1539&limit=200&offset=0; count 18. Same-scope season fixtures: 306; unique fixture team IDs: 18. Missing expected IDs: none. Unexpected IDs: none. Unresolved name conflicts: none.

| Legacy team | legacyTeamId | BSD ID | Live BSD name | Short name | Fixture corroboration |
| --- | --- | --- | --- | --- | --- |
| Alanyaspor | fotmob-4678 | 188 | Alanyaspor | Alanyaspor | yes |
| Amedspor | fotmob-96498 | 3380 | Amed Sportif Faaliyetler | Amed | yes |
| Başakşehir | fotmob-1933 | 194 | Başakşehir FK | Başakşehir | yes |
| Beşiktaş | fotmob-10188 | 196 | Beşiktaş JK | Beşiktaş | yes |
| Çaykur Rizespor | fotmob-2166 | 189 | Çaykur Rizespor | Rizespor | yes |
| Çorum FK | fotmob-357274 | 3295 | Çorum FK | Çorum | yes |
| Erzurumspor FK | fotmob-281467 | 1346 | Erzurumspor FK | Erzurumspor | yes |
| Eyüpspor | fotmob-4681 | 191 | Eyüpspor | Eyüpspor | yes |
| Fenerbahçe | fotmob-8695 | 134 | Fenerbahçe | Fenerbahçe | yes |
| Galatasaray | fotmob-8637 | 125 | Galatasaray | Galatasaray | yes |
| Gaziantep FK | fotmob-4081 | 183 | Gaziantep FK | Gaziantep | yes |
| Gençlerbirliği | fotmob-7800 | 185 | Gençlerbirliği | Gençlerbirliği | yes |
| Göztepe | fotmob-1925 | 190 | Göztepe | Göztepe | yes |
| Kasımpaşa | fotmob-4685 | 187 | Kasımpaşa | Kasımpaşa | yes |
| Kocaelispor | fotmob-1569 | 198 | Kocaelispor | Kocaelispor | yes |
| Konyaspor | fotmob-8622 | 192 | Konyaspor | Konyaspor | yes |
| Samsunspor | fotmob-9750 | 184 | Samsunspor | Samsunspor | yes |
| Trabzonspor | fotmob-9752 | 197 | Trabzonspor | Trabzonspor | yes |

Name differences are shown explicitly. Exact normalized names or a reviewed ID-specific Turkish alias allowlist are accepted; ambiguous/unexpected teams are not silently merged.

## 4. Squad coverage

| Team | Legacy count | BSD rows | Detail/squad checked |
| --- | --- | --- | --- |
| Alanyaspor | 27 | 27 | yes |
| Amed Sportif Faaliyetler | 27 | 29 | yes |
| Başakşehir FK | 31 | 30 | yes |
| Beşiktaş JK | 32 | 32 | yes |
| Çaykur Rizespor | 29 | 31 | yes |
| Çorum FK | 30 | 30 | yes |
| Erzurumspor FK | 27 | 29 | yes |
| Eyüpspor | 29 | 29 | yes |
| Fenerbahçe | 29 | 29 | yes |
| Galatasaray | 31 | 32 | yes |
| Gaziantep FK | 36 | 33 | yes |
| Gençlerbirliği | 32 | 31 | yes |
| Göztepe | 26 | 26 | yes |
| Kasımpaşa | 35 | 36 | yes |
| Kocaelispor | 32 | 31 | yes |
| Konyaspor | 26 | 28 | yes |
| Samsunspor | 30 | 30 | yes |
| Trabzonspor | 30 | 30 | yes |

Total BSD rows: 543; unique IDs: 543; duplicate IDs across rows/squads: 0.

| Duplicate BSD ID | Memberships |
| --- | --- |



## 5. Legacy vs BSD player matching

Normalizer: NFKD, case folding, Turkish dotted/dotless I folding, combining-mark removal, apostrophe unification/removal, hyphen-to-space and whitespace collapse. Display names unchanged. No fuzzy match is auto-mapped.

Priority: unique same-team normalized name first, then same normalized name across all 18 squads. Ambiguous duplicate identities and many-legacy-to-one-BSD claims are rejected. HIGH requires same team + normalized name + equal known shirt number + equal known broad position. Other unique normalized-name candidates are MEDIUM, including cross-team transfer candidates.

| Result | Count | % of legacy |
| --- | --- | --- |
| HIGH | 359 | 66.60% |
| MEDIUM | 88 | 16.33% |
| AMBIGUOUS | 2 | 0.37% |
| NO_MATCH / legacy-only | 90 | 16.70% |
| Any normalized-name candidate (includes ambiguity) | 449 | 83.30% |

| Evidence category (mutually exclusive) | Count |
| --- | --- |
| EXACT_NAME | 30 |
| NORMALIZED_NAME | 9 |
| NAME_AND_NUMBER | 49 |
| NAME_POSITION_NUMBER | 359 |
| AMBIGUOUS | 2 |
| NO_MATCH | 90 |

BSD-only (no normalized-name candidate anywhere in legacy): 95/543 = 17.50%. This means name-unmatched, not proven newly signed players. Same-team unique candidates: 447; cross-team candidates: 0. Full high-confidence mapping exists only in memory (359 entries).

## 6. Shirt-number comparison

Denominator: 447 unique HIGH + MEDIUM candidate pairs (not ambiguous pairs). Missing buckets are exclusive; both-missing is separate.

| Result | Count |
| --- | --- |
| equal | 408 |
| different | 4 |
| missing_legacy | 29 |
| missing_BSD | 0 |
| missing_both | 6 |

Differences (all):

| Legacy team | Legacy name | BSD team | BSD name | Old # | BSD # | Old pos | BSD pos | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Başakşehir | Edin Višća | Başakşehir FK | Edin Višća | 34 | 7 | F | M | MEDIUM |
| Çaykur Rizespor | Habil Özbakir | Çaykur Rizespor | Habil Özbakir | 95 | 21 | D | D | MEDIUM |
| Galatasaray | Can Armando Güner | Galatasaray | Can Armando Güner | 27 | 7 | F | F | MEDIUM |
| Samsunspor | Tanguy Coulibaly | Samsunspor | Tanguy Coulibaly | 70 | 10 | F | M | MEDIUM |

A change can be a real update; it is not classified as provider error.

## 7. Position comparison

| Result | Count |
| --- | --- |
| same | 394 |
| different | 53 |
| missing | 0 |

All candidate position mismatches:

| Legacy team | Legacy name | BSD team | BSD name | Old # | BSD # | Old pos | BSD pos | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Beşiktaş | Ernest Poku | Beşiktaş JK | Ernest Poku | 17 | 17 | M | F | MEDIUM |
| Beşiktaş | Milot Rashica | Beşiktaş JK | Milot Rashica | 7 | 7 | F | M | MEDIUM |
| Beşiktaş | Václav Cerny | Beşiktaş JK | Václav Černý | 18 | 18 | F | M | MEDIUM |
| Beşiktaş | İlhan Fakılı | Beşiktaş JK | İlhan Fakılı | 29 | 29 | F | M | MEDIUM |
| Kocaelispor | Haydar Karataş | Kocaelispor | Haydar Karataş | 19 | 19 | M | F | MEDIUM |
| Kocaelispor | Metehan Altunbaş | Kocaelispor | Metehan Altunbaş | 26 | 26 | F | M | MEDIUM |
| Kocaelispor | Makana Baku | Kocaelispor | Makana Baku | 32 | 32 | F | M | MEDIUM |
| Kocaelispor | Rigoberto Rivas | Kocaelispor | Rigoberto Rivas | 99 | 99 | F | M | MEDIUM |
| Göztepe | Alexis Antunes | Göztepe | Alexis Antunes | 8 | 8 | M | F | MEDIUM |
| Göztepe | Efkan Bekiroğlu | Göztepe | Efkan Bekiroğlu | 10 | 10 | M | F | MEDIUM |
| Başakşehir | Eldor Shomurodov | Başakşehir FK | Eldor Shomurodov | 14 | 14 | M | F | MEDIUM |
| Başakşehir | Yusuf Sarı | Başakşehir FK | Yusuf Sarı | 7 | 7 | F | M | MEDIUM |
| Başakşehir | Edin Višća | Başakşehir FK | Edin Višća | 34 | 7 | F | M | MEDIUM |
| Başakşehir | Andreas Skov Olsen | Başakşehir FK | Andreas Skov Olsen | 70 | 70 | F | M | MEDIUM |
| Çaykur Rizespor | Valentin Mihăilă | Çaykur Rizespor | Valentin Mihăilă | 7 | 7 | F | M | MEDIUM |
| Çaykur Rizespor | Ahmed Kutucu | Çaykur Rizespor | Ahmed Kutucu | 23 | 23 | F | M | MEDIUM |
| Erzurumspor FK | Miguel Cardoso | Erzurumspor FK | Miguel Cardoso | 20 | 20 | F | M | MEDIUM |
| Erzurumspor FK | Mustafa Fettahoğlu | Erzurumspor FK | Mustafa Fettahoglu | 99 | 99 | F | M | MEDIUM |
| Çorum FK | Cengiz Ünder | Çorum FK | Cengiz Ünder | 7 | 7 | F | M | MEDIUM |
| Çorum FK | Göktan Gürpüz | Çorum FK | Göktan Gürpüz | 21 | 21 | F | M | MEDIUM |
| Gaziantep FK | Fuat Bavuk | Gaziantep FK | Fuat Bavuk | 97 | 97 | D | F | MEDIUM |
| Gaziantep FK | Karamba Gassama | Gaziantep FK | Karamba Gassama | 17 | 17 | F | M | MEDIUM |
| Gaziantep FK | Enver Kulašin | Gaziantep FK | Enver Kulašin | 27 | 27 | F | M | MEDIUM |
| Alanyaspor | Şahin Dik | Alanyaspor | Şahin Dik | missing | 17 | D | M | MEDIUM |
| Alanyaspor | İbrahim Kaya | Alanyaspor | Ibrahim Kaya | 7 | 7 | M | F | MEDIUM |
| Alanyaspor | Ianis Hagi | Alanyaspor | Ianis Hagi | 10 | 10 | M | F | MEDIUM |
| Alanyaspor | Emre Demir | Alanyaspor | Emre Demir | missing | 14 | F | M | MEDIUM |
| Eyüpspor | Diabel Ndoye | Eyüpspor | Diabel Ndoye | 14 | 14 | M | D | MEDIUM |
| Eyüpspor | Christ Sadia | Eyüpspor | Christ Sadia | 84 | 84 | M | F | MEDIUM |
| Eyüpspor | Lenny Pintor | Eyüpspor | Lenny Pintor | 11 | 11 | F | M | MEDIUM |
| Eyüpspor | Konrad Michalak | Eyüpspor | Konrad Michalak | 77 | 77 | F | M | MEDIUM |
| Eyüpspor | Bilal Boutobba | Eyüpspor | Bilal Boutobba | 98 | 98 | F | M | MEDIUM |
| Kasımpaşa | Thiemoko Diarra | Kasımpaşa | Thiemoko Diarra | 11 | 11 | F | M | MEDIUM |
| Kasımpaşa | Mortadha Ben Ouanes | Kasımpaşa | Mortadha Ben Ouanes | 12 | 12 | F | M | MEDIUM |
| Kasımpaşa | Jesurun Rak-Sakyi | Kasımpaşa | Jesurun Rak-Sakyi | 17 | 17 | F | M | MEDIUM |
| Kasımpaşa | Marcus Rafferty | Kasımpaşa | Marcus Rafferty | 19 | 19 | F | M | MEDIUM |
| Kasımpaşa | Sercan Deniz | Kasımpaşa | Sercan Deniz | 35 | 35 | F | M | MEDIUM |
| Gençlerbirliği | Peter Etebo | Gençlerbirliği | Peter Etebo | 5 | 5 | F | M | MEDIUM |
| Konyaspor | Deniz Türüc | Konyaspor | Deniz Türüç | 9 | 9 | F | M | MEDIUM |
| Konyaspor | Emir Bars | Konyaspor | Emir Bars | 45 | 45 | F | M | MEDIUM |
| Galatasaray | Leroy Sané | Galatasaray | Leroy Sané | 10 | 10 | F | M | MEDIUM |
| Galatasaray | Barış Alper Yılmaz | Galatasaray | Barış Alper Yılmaz | 53 | 53 | F | M | MEDIUM |
| Fenerbahçe | Mason Greenwood | Fenerbahçe | Mason Greenwood | 11 | 11 | F | M | MEDIUM |
| Fenerbahçe | Oğuz Aydın | Fenerbahçe | Oğuz Aydın | 70 | 70 | F | M | MEDIUM |
| Amedspor | Gökhan Gül | Amed Sportif Faaliyetler | Gökhan Gül | 18 | 18 | D | M | MEDIUM |
| Amedspor | Ermal Krasniqi | Amed Sportif Faaliyetler | Ermal Krasniqi | 7 | 7 | F | M | MEDIUM |
| Amedspor | Rayan Lutin | Amed Sportif Faaliyetler | Rayan Lutin | 93 | 93 | F | M | MEDIUM |
| Samsunspor | Emre Kilinç | Samsunspor | Emre Kılınç | 11 | 11 | F | M | MEDIUM |
| Samsunspor | Tanguy Coulibaly | Samsunspor | Tanguy Coulibaly | 70 | 10 | F | M | MEDIUM |
| Trabzonspor | Okay Yokuşlu | Trabzonspor | Okay Yokuşlu | 5 | 5 | D | M | MEDIUM |
| Trabzonspor | Mohamed Salah | Trabzonspor | Mohamed Salah | 10 | 10 | F | M | MEDIUM |
| Trabzonspor | Noah Saviolo | Trabzonspor | Noah Saviolo | 70 | 70 | F | M | MEDIUM |
| Trabzonspor | Metehan Mimaroğlu | Trabzonspor | Metehan Mimaroğlu | 77 | 77 | F | M | MEDIUM |

BSD squad observed position values: D, F, G, M. Missing/unknown positions across all BSD rows: 0.

## 8. Detailed role availability

Squad responses do not contain detailed roles. Player detail DOES expose `specific_position`; actual values must be inspected rather than treating an absent squad field as absent provider capability.

| BSD player ID | Name | Broad position | specific_position | Detail status |
| --- | --- | --- | --- | --- |
| 6686 | Arda Yılmaz | G | GK | observed |
| 4103 | El Chadaille Bitshiabu | D | CB | observed |
| 5728 | Eyüp Aydın | M | CM | observed |
| 9021 | Can Armando Güner | F | FWD | observed |
| 3724 | Uğurcan Çakır | G | GK | observed |
| 3728 | Ismail Jakobs | D | LB | observed |
| 3726 | Davinson Sánchez | D | CB | observed |
| 4218 | Kaan Ayhan | D | RB | observed |
| 3725 | Roland Sallai | D | RB | observed |
| 28316 | Aleksey Batrakov | M | AM | observed |

| Product role | Classification | Evidence |
| --- | --- | --- |
| KL | DIRECTLY_AVAILABLE | Observed specific_position=GK; translated to product label |
| STP | DIRECTLY_AVAILABLE | Observed specific_position=CB; translated to product label |
| SLB | DIRECTLY_AVAILABLE | Observed specific_position=LB; translated to product label |
| SĞB | DIRECTLY_AVAILABLE | Observed specific_position=RB; translated to product label |
| ÖL | NOT_AVAILABLE | No sufficiently specific code in the inspected sample; not an exhaustive provider-wide absence claim |
| MO | DIRECTLY_AVAILABLE | Observed specific_position=CM; translated to product label |
| OO | DIRECTLY_AVAILABLE | Observed specific_position=AM; translated to product label |
| SLK | NOT_AVAILABLE | No sufficiently specific code in the inspected sample; not an exhaustive provider-wide absence claim |
| SĞK | NOT_AVAILABLE | No sufficiently specific code in the inspected sample; not an exhaustive provider-wide absence claim |
| SF | NOT_AVAILABLE | No sufficiently specific code in the inspected sample; not an exhaustive provider-wide absence claim |

DIRECTLY_AVAILABLE denotes an explicit specific-position code with a mechanical label translation; no tactical role is inferred from a name or shirt number. Generic FWD is not proof of center-forward versus winger. Legacy roles only choose diverse probe subjects. This bounded sample is not 543-player detailed-role coverage and cannot reconstruct multi-role arrays for every player. Other codes may exist outside the sample.

## 9. Team color availability

| Team | Current colors | Observed BSD color fields | Usable |
| --- | --- | --- | --- |
| Alanyaspor | #ef802b / #228756 | none | no |
| Amed Sportif Faaliyetler | #168553 / #c5353d | none | no |
| Başakşehir FK | #ed7835 / #213a63 | none | no |
| Beşiktaş JK | #222222 / #eeeeee | none | no |
| Çaykur Rizespor | #198c55 / #276dad | none | no |
| Çorum FK | #c1303b / #242a28 | none | no |
| Erzurumspor FK | #2c65ad / #ffffff | none | no |
| Eyüpspor | #713576 / #e6be42 | none | no |
| Fenerbahçe | #19294d / #f3d233 | none | no |
| Galatasaray | #a51935 / #efb62a | none | no |
| Gaziantep FK | #c3313c / #252b2b | none | no |
| Gençlerbirliği | #b72637 / #262725 | none | no |
| Göztepe | #bb2039 / #edc932 | none | no |
| Kasımpaşa | #173c74 / #ffffff | none | no |
| Kocaelispor | #148255 / #242b28 | none | no |
| Konyaspor | #23855c / #ffffff | none | no |
| Samsunspor | #ca303a / #eeeeee | none | no |
| Trabzonspor | #702039 / #8cc1dc | none | no |

No palette modified. No image/logo inspected or downloaded. Team short_name values longer than current 8-character schema limit: Alanyaspor, Başakşehir FK, Erzurumspor FK, Fenerbahçe, Galatasaray, Gaziantep FK, Gençlerbirliği, Kasımpaşa, Kocaelispor, Konyaspor, Samsunspor, Trabzonspor.

## 10. Starting-XI feasibility

Confirmed recent XI: **18/18**; upcoming predicted XI: **0/18**; neither in bounded probe: **0/18**.

At most two most-recent completed same-season matches before now per team, stopping at first valid confirmed XI; one nearest upcoming same-season fixture per team. Identical event requests share an in-memory promise cache. Uses existing normalizeLineups + validXI, including exact 11 unique starters and one goalkeeper. Does not fetch stats/incidents/media.

| Team | Confirmed match/date | Predicted match/date | Probed event IDs/status | Confirmed XI IDs absent from current squad |
| --- | --- | --- | --- | --- |
| Alanyaspor | 216005 / 2026-09-19T14:00:00.000Z | not found | 216005:confirmed, 216006:missing | none |
| Amed Sportif Faaliyetler | 215997 / 2026-09-20T17:00:00.000Z | not found | 215997:confirmed, 216011:missing | none |
| Başakşehir FK | 215998 / 2026-09-19T17:00:00.000Z | not found | 215998:confirmed, 216012:missing | none |
| Beşiktaş JK | 215997 / 2026-09-20T17:00:00.000Z | not found | 215997:confirmed, 216007:missing | none |
| Çaykur Rizespor | 216001 / 2026-09-20T17:00:00.000Z | not found | 216001:confirmed, 216014:missing | none |
| Çorum FK | 216005 / 2026-09-19T14:00:00.000Z | not found | 216005:confirmed, 216010:missing | none |
| Erzurumspor FK | 215999 / 2026-09-20T14:00:00.000Z | not found | 215999:confirmed, 216006:missing | none |
| Eyüpspor | 216000 / 2026-09-20T14:00:00.000Z | not found | 216000:confirmed, 216008:missing | none |
| Fenerbahçe | 216000 / 2026-09-20T14:00:00.000Z | not found | 216000:confirmed, 216014:missing | none |
| Galatasaray | 216004 / 2026-09-19T17:00:00.000Z | not found | 216004:confirmed, 216009:missing | none |
| Gaziantep FK | 216003 / 2026-09-19T14:00:00.000Z | not found | 216003:confirmed, 216010:missing | none |
| Gençlerbirliği | 215998 / 2026-09-19T17:00:00.000Z | not found | 215998:confirmed, 216011:missing | none |
| Göztepe | 216001 / 2026-09-20T17:00:00.000Z | not found | 216001:confirmed, 216008:missing | none |
| Kasımpaşa | 216002 / 2026-09-18T17:00:00.000Z | not found | 216002:confirmed, 216009:missing | none |
| Kocaelispor | 216003 / 2026-09-19T14:00:00.000Z | not found | 216003:confirmed, 216007:missing | none |
| Konyaspor | 216002 / 2026-09-18T17:00:00.000Z | not found | 216002:confirmed, 216012:missing | none |
| Samsunspor | 215999 / 2026-09-20T14:00:00.000Z | not found | 215999:confirmed, 216013:missing | none |
| Trabzonspor | 216004 / 2026-09-19T17:00:00.000Z | not found | 216004:confirmed, 216013:missing | none |

Availability is a point-in-time bounded observation, not proof that older fixtures have no lineup or future predictions will remain available. Replacement proposal: latest eligible confirmed XI, explicitly labelled recent-match basis; retain only current squad identities and deterministically fill gaps from BSD broad positions. Do not use legacy starts/value/photo truthiness. No Studio behavior changed.

## 11. Legacy → BSD mapping confidence

HIGH proposals: 359; all legacy IDs and BSD targets unique. No IDs written to DB or made primary keys. HIGH is evidence-based candidate confidence, not externally certified identity.

| legacyPlayerId | Legacy name | BSD player ID | BSD name | Confidence |
| --- | --- | --- | --- | --- |
| 554534 | Alexander Nübel | 1609 | Alexander Nübel | HIGH |
| 958273 | Doğan Alemdar | 4787 | Doğan Alemdar | HIGH |
| 1664710 | Emir Yaşar | 8643 | Emir Yaşar | HIGH |
| 1387194 | Kassoum Ouattara | 2238 | Kassoum Ouattara | HIGH |
| 1114979 | Emmanuel Agbadou | 524 | Emmanuel Agbadou | HIGH |
| 1487872 | Taylan Bulut | 5829 | Taylan Bulut | HIGH |
| 992071 | Rıdvan Yılmaz | 5832 | Rıdvan Yılmaz | HIGH |
| 866358 | Tiago Djaló | 5831 | Tiago Djaló | HIGH |
| 1366373 | Ümit Akdağ | 5789 | Ümit Akdağ | HIGH |
| 873855 | Emirhan Topçu | 5839 | Emirhan Topçu | HIGH |
| 1393980 | Yasin Özcan | 7355 | Yasin Özcan | HIGH |
| 643635 | Amir Murillo | 4082 | Amir Murillo | HIGH |
| 533228 | Wilfred Ndidi | 6630 | Wilfred Ndidi | HIGH |
| 738064 | Salih Özcan | 3916 | Salih Özcan | HIGH |
| 935409 | Orkun Kökcü | 5835 | Orkun Kökçü | HIGH |

Team proposals are the explicit legacyTeamId → BSD ID table in section 3. MEDIUM/cross-team and ambiguous cases require review; never apply solely by shirt number, surname or approximate name.

## 12. Unmatched / ambiguous cases

Cross-team same-normalized-name candidates (possible transfers; not verified transfer history):

| Legacy team | Legacy name | BSD team | BSD name | Old # | BSD # | Old pos | BSD pos | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |


Ambiguous cases:

| Legacy ID | Team | Name | BSD candidates |
| --- | --- | --- | --- |
| 1011932 | Çaykur Rizespor | Moussa Diakité | 17199 Çaykur Rizespor Moussa Diakité |
| 1415502 | Çaykur Rizespor | Moussa Diakité | 17199 Çaykur Rizespor Moussa Diakité |

Legacy-only after searching all collected squads; not proof a player left the league (spelling aliases, incomplete provider coverage, or snapshot errors remain possible):

| legacyPlayerId | Team | Name |
| --- | --- | --- |
| 2210579 | Beşiktaş | Azem Yortac |
| 1001348 | Beşiktaş | Kartal Yılmaz |
| 1638880 | Beşiktaş | Fahri Ay |
| 1896214 | Beşiktaş | Ahmet Bircan |
| 798661 | Kocaelispor | Anfernee Dijksteel |
| 2160705 | Kocaelispor | Hulusi Destici |
| 1245179 | Kocaelispor | Habib Keïta |
| 1093003 | Kocaelispor | Tobias Gulliksen |
| 1210041 | Kocaelispor | Uğur Yıldız |
| 614269 | Kocaelispor | Samet Yalçin |
| 627223 | Kocaelispor | Daniel Agyei |
| 1367959 | Göztepe | Mehmet Öztürk |
| 1304343 | Göztepe | Allan Godói |
| 1459652 | Göztepe | André |
| 1118178 | Göztepe | Juan |
| 889745 | Göztepe | Bekir Böke |
| 1304538 | Başakşehir | Francis Nzaba |
| 1138299 | Başakşehir | Ömer Beyaz |
| 1780234 | Başakşehir | Berkay Aslan |
| 1249993 | Başakşehir | Abbosbek Fayzullayev |
| 1135987 | Çaykur Rizespor | Khusniddin Alikulov |
| 1211804 | Çaykur Rizespor | Adedire Awokoya Mebude |
| 2106976 | Çaykur Rizespor | Mustafa Tosun |
| 2132142 | Erzurumspor FK | Omer Kara |
| 1392225 | Erzurumspor FK | Nəriman Akhundzada |
| 1217167 | Çorum FK | Polat Abay |
| 842682 | Çorum FK | Markus Seehusen Karlsbakk |
| 1064272 | Çorum FK | Mohamed Diomandé |
| 2132134 | Çorum FK | Hasanege Akdogan |
| 299358 | Çorum FK | Mame Baba Thiam |
| 1327848 | Çorum FK | Feyttullah Gürlük |
| 1766201 | Gaziantep FK | İbrahim Alkış |
| 1894907 | Gaziantep FK | Mervan Müjdeci |
| 1678863 | Gaziantep FK | Burak Yıkıcı |
| 1755390 | Gaziantep FK | Taha Güneş |
| 1788160 | Gaziantep FK | Yusuf Delen |
| 1637892 | Gaziantep FK | Victor Gidado |
| 861520 | Gaziantep FK | Florin Ștefan |
| 1665501 | Gaziantep FK | Ali Mevran Ablak |
| 1762856 | Gaziantep FK | Ali Kalın |
| 1894910 | Gaziantep FK | Muhammed Akmelek |
| 1662153 | Alanyaspor | Mert Bayram |
| 1402068 | Alanyaspor | Ruan |
| 433677 | Alanyaspor | Ui-Jo Hwang |
| 1398327 | Alanyaspor | Baran Gezek |
| 694060 | Alanyaspor | Meschack Elia |
| 1813321 | Eyüpspor | Gilbert Mendy |
| 1210344 | Eyüpspor | Anıl Yaşar |
| 872726 | Eyüpspor | Mete Kaan Demir |
| 2137178 | Eyüpspor | Musa Eren Karakas |
| 820085 | Kasımpaşa | Ali Yanar |
| 1670593 | Kasımpaşa | Şant Kazancı |
| 1437464 | Kasımpaşa | Jakob Vestergaard Jessen |
| 239626 | Kasımpaşa | Kamil Cörekci |
| 2175248 | Kasımpaşa | Ahmet Salih |
| 1197741 | Kasımpaşa | Matei Cristian Ilie |
| 1489024 | Kasımpaşa | Taylan Aydın |
| 1398128 | Kasımpaşa | Oğuzhan Yılmaz |
| 1595606 | Kasımpaşa | Elson Mendes Da Silva |
| 997497 | Kasımpaşa | Ali Kol |
| 2130621 | Kasımpaşa | Muhammed Emin Bektash |
| 2132150 | Gençlerbirliği | Berk Cukurcu |
| 707777 | Gençlerbirliği | İrfan Eğribayat |
| 1801058 | Gençlerbirliği | Hamza Aydar |
| 282615 | Gençlerbirliği | Dimitrios Goutas |
| 1794421 | Gençlerbirliği | Emirhan Unal |
| 1794424 | Gençlerbirliği | Arda Çelik |
| 1240708 | Gençlerbirliği | Moussa Kyabou |
| 547710 | Gençlerbirliği | Adama Traoré |
| 1984830 | Gençlerbirliği | Erk Aslan |
| 1895450 | Gençlerbirliği | Prince Martor Jr. |
| 2140571 | Konyaspor | Alpha Fofana |
| 2133064 | Fenerbahçe | Kuzey Sapaz |
| 316544 | Fenerbahçe | İrfan Kahveci |
| 938416 | Amedspor | Mustafa Burak Bozan |
| 470399 | Amedspor | David Bates |
| 1054011 | Amedspor | Collins Sor |
| 1797560 | Samsunspor | Efe Üstün |
| 1677480 | Samsunspor | Efe Töruz |
| 1436939 | Samsunspor | Oskar Öhlenschlaeger |
| 1666481 | Samsunspor | Anto Sekongo |
| 1609641 | Samsunspor | Alper Pazar |
| 953517 | Samsunspor | Marius Mouandilmadji |
| 1514682 | Samsunspor | Kouadou Assoumou |
| 1677467 | Trabzonspor | Ahmet Yıldırım |
| 1752855 | Trabzonspor | Erol Çolak |
| 1037491 | Trabzonspor | Arseniy Batahov |
| 459658 | Trabzonspor | Ruslan Malinovsky |
| 1374500 | Trabzonspor | Franculino |
| 411605 | Trabzonspor | Mehmet Umut Nayir |

BSD-only normalized names:

| BSD player ID | Team | Name |
| --- | --- | --- |
| 6729 | Alanyaspor | Meschak Elia |
| 5796 | Alanyaspor | Hwang Ui-Jo |
| 5801 | Alanyaspor | Mert Furkan Bayram |
| 5793 | Alanyaspor | Ruan Pereira Duarte |
| 6352 | Alanyaspor | Baran Ali Gezek |
| 7642 | Amed Sportif Faaliyetler | David Robert Bates |
| 6673 | Amed Sportif Faaliyetler | Burak Bozan |
| 208569 | Amed Sportif Faaliyetler | Muhammed Damar |
| 3130 | Amed Sportif Faaliyetler | Yira Collins Sor |
| 92692 | Amed Sportif Faaliyetler | Hüseyin Ülgüt |
| 127578 | Başakşehir FK | Efe Arda Koyuncu |
| 159830 | Başakşehir FK | Ege Öztürk |
| 6642 | Başakşehir FK | Abbosbek Fayzullaev |
| 59016 | Beşiktaş JK | Mustafa Yortaç |
| 8644 | Beşiktaş JK | Ahmet Sami Bircan |
| 5833 | Beşiktaş JK | Kartal Kayra Yılmaz |
| 214112 | Beşiktaş JK | Élan Joshep Ricardo Ochoa |
| 5865 | Çaykur Rizespor | Husniddin Aliqulov |
| 6739 | Çaykur Rizespor | Yakup Ayan |
| 7551 | Çaykur Rizespor | Adedire Mebude |
| 86516 | Çaykur Rizespor | Mustafa Coskun Tosun |
| 185592 | Çaykur Rizespor | Hasan Yağız Döne |
| 97934 | Çaykur Rizespor | Muhammed Baltaci |
| 65042 | Çorum FK | Hasan Ege Akdogan |
| 6349 | Çorum FK | Mame Thiam |
| 50238 | Çorum FK | Markus Karlsbakk |
| 3018 | Çorum FK | Mohammed Diomande |
| 65046 | Çorum FK | Emircan Gürlük |
| 65053 | Çorum FK | Atakan Cangöz |
| 27415 | Erzurumspor FK | Ömer Arda Kara |
| 185687 | Erzurumspor FK | Yigit Baran Karaoglan |
| 3644 | Erzurumspor FK | Nariman Akhundzade |
| 144497 | Erzurumspor FK | Kerem Erener |
| 7133 | Eyüpspor | Seyfettin Anıl Yaşar |
| 10579 | Eyüpspor | Ömer Ahmet Ceyhan |
| 185694 | Eyüpspor | Musa Karakas |
| 7097 | Eyüpspor | Mete Demir |
| 52334 | Fenerbahçe | Emin Eren Sayar |
| 4577 | Fenerbahçe | İrfan Can Kahveci |
| 6686 | Galatasaray | Arda Yılmaz |
| 6677 | Gaziantep FK | Ali Osman Kalın |
| 8571 | Gaziantep FK | Muhammet Akmelek |
| 211261 | Gaziantep FK | Kadir Gümüş |
| 7130 | Gaziantep FK | Ibrahim Kagan Alkis |
| 8570 | Gaziantep FK | Gidado Victor Ntino-Emo |
| 65845 | Gaziantep FK | Burak Enes Yikici |
| 7072 | Gaziantep FK | Muhammet Taha Gunes |
| 7011 | Gençlerbirliği | Yiğit Hamza Aydar |
| 6748 | Gençlerbirliği | Dimitris Goutas |
| 64043 | Gençlerbirliği | Berat Can Sebat |
| 8624 | Gençlerbirliği | Arda Cagan Celik |
| 52335 | Gençlerbirliği | Erk Arda Aslan |
| 8625 | Gençlerbirliği | Prince Martor |
| 36110 | Gençlerbirliği | Berk Deniz Çukurcu |
| 3422 | Gençlerbirliği | İrfan Can Eğribayat |
| 7057 | Gençlerbirliği | Adama Malouda Traoré |
| 5706 | Göztepe | Allan |
| 617 | Göztepe | André Henrique |
| 5715 | Göztepe | Juan Santos da Silva |
| 86870 | Göztepe | Bekir Turaç Böke |
| 7025 | Göztepe | Mehmet Şamil Öztürk |
| 74284 | Kasımpaşa | Jakob Jessen |
| 8610 | Kasımpaşa | Kamil Ahmet Çörekçi |
| 159933 | Kasımpaşa | Salih Arici |
| 11634 | Kasımpaşa | Matei Ilie |
| 5701 | Kasımpaşa | Taylan Utku Aydın |
| 5697 | Kasımpaşa | Ali Yavuz Kol |
| 65433 | Kasımpaşa | Mecit Deniz |
| 5703 | Kasımpaşa | Emirhan Yiğit |
| 147993 | Kasımpaşa | Muhammed Bektaş |
| 65434 | Kasımpaşa | Stann Élysée Dalo |
| 6880 | Kasımpaşa | Ali Emre Yanar |
| 22080 | Kasımpaşa | Elson Mendes |
| 6576 | Kocaelispor | Anfernee Jamal Dijksteel |
| 13528 | Kocaelispor | Deniz Ceylan |
| 6881 | Kocaelispor | Uğur Kaan Yıldız |
| 6567 | Kocaelispor | Dan Agyei |
| 16304 | Kocaelispor | Tobias Fjeld Gulliksen |
| 206421 | Kocaelispor | Hulisi Destici |
| 30731 | Konyaspor | Ata Yanık |
| 97937 | Konyaspor | Emir Gündoğdu |
| 6820 | Konyaspor | Mücahit Ibrahimoglu |
| 13613 | Samsunspor | Efe Yiğit Üstün |
| 5740 | Samsunspor | Efe Berat Törüz |
| 37209 | Samsunspor | Alper Efe Pazar |
| 12780 | Samsunspor | Oskar Øhlenschlaeger |
| 37210 | Samsunspor | Eyup Degirmenci |
| 38085 | Samsunspor | Antoine Sekongo |
| 8760 | Samsunspor | Jaures Assoumou |
| 6612 | Trabzonspor | Arseniy Batagov |
| 3250 | Trabzonspor | Franculino Djú |
| 6490 | Trabzonspor | Umut Nayir |
| 6625 | Trabzonspor | Ahmet Doğan Yıldırım |
| 37416 | Trabzonspor | Erol Can Çolak |
| 2593 | Trabzonspor | Ruslan Malinovskyi |


## 13. Migration-sensitive code locations

| System | Source reference | Assumption / required future handling |
| --- | --- | --- |
| Classic Taktik Tahtası | dist/app.js:31,72,76,84,98,112 | Roster name-key lookup; athleteId === catalogue id; bench exclusion and overrides use identity equality. Photo/starts/value affect XI; source attribution is FotMob. |
| Comparison | dist/comparison.js:24,28 | Same board contract. Team select values are display names, so name changes also need compatibility. |
| Free Studio | src/lib/match-layout.js:28,39,46 | Derives fotmob-* from URL; source player ids pass isMatchId numeric validation; local:&lt;side&gt;:&lt;team&gt;:&lt;player&gt; keys. |
| Match Studio | src/lib/studio-lineups.js:5; src/lib/match-layout.js:51,67 | BSD team/provider ids and numeric player ids; probable-local may still contain legacy player ids. Preserve provenance namespace. |
| Player overrides | src/lib/player-overrides.js:3,8; supabase/migrations/20260924094207_player_overrides.sql | local:&lt;alphanumeric id&gt; versus bsd:&lt;numeric id&gt;. Renaming catalogue IDs without mapping disconnects existing edits; do not merge collisions. |
| Studio Projects | src/lib/studio-project-snapshot.js:27,31,35,46; supabase/migrations/20260923135716_studio_projects.sql | Self-contained snapshots carry teamId/playerId/key plus slotKey/personKey relationships and bench. Text IDs accepted here; rewriting must preserve all references. |
| Drafts | src/lib/drafts.js; src/lib/draft-scope.js; src/lib/validation.js:18 | User/shared scope keys do not encode provider; payloads retain athleteId and team names. Preserve isolation and old drafts. |
| Shared lineups | src/lib/validation.js:18,39; supabase/schema/football.sql:55; supabase/functions/lineups/index.ts | Read-only snapshot display should stay independent. athleteId is bounded text, slot id is 0..10. No need to rewrite public historical snapshots merely to show them. |
| Catalogue/SQL | src/lib/catalogue.js:27,31; supabase/schema/football.sql:13,25 | DB IDs are text, not intrinsically FotMob/numeric. Name &lt;=100, numbers 1..99 or NULL; roles whitelist; colors required. FotMob fallback source URL is explicit. |
| Seed | scripts/prepare-seed.mjs:12,16 | Derives FotMob IDs and legacy rank; separate future importer needed. Do not regenerate now. |
| BSD team mapping | supabase/functions/matches/teams.js:4 | All 18 mappings retain fotmob-* ID and local palette. Replace identity mapping without altering event IDs. |
| Tests | tests/backend.test.mjs; tests/player-jersey.test.mjs; tests/matches-provider.test.mjs; tests/studio-projects.test.mjs; tests/player-overrides.test.mjs | Fixtures/validation/equality and seed-mapping assumptions require targeted regressions before migration. |

Recommended design: independent internal team/player identity with provider mappings (provider, external_id), plus legacy aliases. Changing numeric IDs to UUIDs is not a drop-in change: Free/Match lineup helpers currently validate numeric player IDs. Classic athleteId allows text but relies on catalogue equality. Catalogue team-name changes affect name-keyed lookup and Comparison selects. Preserve user-owned override/draft/project keys and historical readonly shares; no broad DB rewrite or policy change is proposed here.

## 14. API request count

This full audit run: **61 GET requests**. Failed HTTP/network/JSON requests: **0**. Retries: **0**. Maximum concurrency: **4**. Hard ceiling: **90/run**. In-memory caching prevents duplicate paths within the run.

A separate initial schema-discovery run made exactly 2 successful GETs (teams/125/ and teams/125/squad/) before this full run; total task data-API requests through this run: **63**. Public documentation reads are separate from authenticated data-API quota calls.

| GET endpoint (relative to https://sports.bzzoiro.com/api/v2/) | HTTP status | Failure |
| --- | --- | --- |
| teams/125/ | 200 | none |
| teams/125/squad/ | 200 | none |
| teams/?league_id=11&season_id=1539&limit=200&offset=0 | 200 | none |
| teams/188/ | 200 | none |
| teams/3380/ | 200 | none |
| teams/194/ | 200 | none |
| teams/196/ | 200 | none |
| teams/188/squad/ | 200 | none |
| teams/3380/squad/ | 200 | none |
| teams/194/squad/ | 200 | none |
| teams/196/squad/ | 200 | none |
| teams/189/ | 200 | none |
| teams/3295/ | 200 | none |
| teams/1346/ | 200 | none |
| teams/191/ | 200 | none |
| teams/189/squad/ | 200 | none |
| teams/3295/squad/ | 200 | none |
| teams/191/squad/ | 200 | none |
| teams/1346/squad/ | 200 | none |
| teams/134/ | 200 | none |
| teams/134/squad/ | 200 | none |
| teams/183/ | 200 | none |
| teams/185/ | 200 | none |
| teams/190/ | 200 | none |
| teams/187/ | 200 | none |
| teams/185/squad/ | 200 | none |
| teams/190/squad/ | 200 | none |
| teams/183/squad/ | 200 | none |
| teams/187/squad/ | 200 | none |
| teams/198/ | 200 | none |
| teams/192/ | 200 | none |
| teams/184/ | 200 | none |
| teams/197/ | 200 | none |
| teams/198/squad/ | 200 | none |
| teams/192/squad/ | 200 | none |
| teams/184/squad/ | 200 | none |
| teams/197/squad/ | 200 | none |
| players/6686/ | 200 | none |
| players/4103/ | 200 | none |
| players/5728/ | 200 | none |
| players/9021/ | 200 | none |
| events/?league_id=11&season_id=1539&limit=200&offset=0 | 200 | none |
| events/?league_id=11&season_id=1539&limit=200&offset=200 | 200 | none |
| events/216005/lineups/ | 200 | none |
| events/215997/lineups/ | 200 | none |
| events/215998/lineups/ | 200 | none |
| events/216006/lineups/ | 200 | none |
| events/216011/lineups/ | 200 | none |
| events/216007/lineups/ | 200 | none |
| events/216012/lineups/ | 200 | none |
| events/216001/lineups/ | 200 | none |
| events/216010/lineups/ | 200 | none |
| events/215999/lineups/ | 200 | none |
| events/216000/lineups/ | 200 | none |
| events/216014/lineups/ | 200 | none |
| events/216008/lineups/ | 200 | none |
| events/216004/lineups/ | 200 | none |
| events/216003/lineups/ | 200 | none |
| events/216002/lineups/ | 200 | none |
| events/216013/lineups/ | 200 | none |
| events/216009/lineups/ | 200 | none |



Supplemental role verification: 2026-09-24T22:04:08.050Z. After the first full run, 4 direct read-only detail rechecks (players/6686/, players/4103/, players/5728/, players/9021/) all returned 200, without retries. This focused scripted supplement made 11 GETs, 0 failures, 0 retries. Exact aggregate task data-API count: **78** = 2 initial probes + 61 full audit + 4 value rechecks + 11 focused supplement. Repeated schema/value probes are explicit diagnostic rechecks, not automatic HTTP retries.

| Supplemental GET endpoint | HTTP | Failure |
| --- | --- | --- |
| teams/125/squad/ | 200 | none |
| players/6686/ | 200 | none |
| players/4103/ | 200 | none |
| players/5728/ | 200 | none |
| players/9021/ | 200 | none |
| players/3724/ | 200 | none |
| players/3728/ | 200 | none |
| players/3726/ | 200 | none |
| players/4218/ | 200 | none |
| players/3725/ | 200 | none |
| players/28316/ | 200 | none |

## 15. Risks / unknowns

- Current squad is current club membership, not a frozen 2026/27 roster; fixtures establish league-season participation separately.
- Normalized-name matching is not an identity authority. Diacritic folding can collide; ambiguous and multiple-target claims remain unmerged.
- Legacy snapshot dates to 2026-09-12; absence or number/position change is not automatically BSD error.
- Detailed roles and colors require independent/internal product decisions if unavailable; do not retain unproven legacy rank as a hidden fallback.
- Sampled player-detail schema is not exhaustive across every player. Squad field coverage is exhaustive only for successfully fetched teams.
- Future historical projects and overrides need identity compatibility, not a blind string rename.
- This report does not establish legal/licensing or production release approval. No live Supabase endpoint was called.
- No raw provider responses, images or credentials were saved. Report contains selected audit facts, comparisons and schema field names only.

## 16. Final recommendation

| Question | Decision | Evidence |
| --- | --- | --- |
| A — 18-team league list | YES | 18/18 verified; 18 scoped provider teams; 18 fixture team IDs |
| B — Team names | YES | Live detail/list names available; aliases/display-name migration and short-name bounds need handling |
| C — Squad membership | YES | 18/18 current squads; 543 unique IDs; not historical season registration |
| D — Player names | YES | 543/543 named squad rows |
| E — Player IDs as provider mappings | YES | 543 unique external IDs; only 359/539 legacy identities HIGH; keep separate internal IDs |
| F — Shirt numbers | PARTIAL | 529/543 current-schema-compatible numbers |
| G — G/D/M/F positions | YES | 543/543 normalized positions |
| H — Detailed roles | PARTIAL | 6/10 role types have evidence in the bounded player-detail sample; no complete multi-role coverage |
| I — Default-XI selection | YES | 18/18 recent confirmed XI; 0/18 upcoming predicted XI; deterministic gap handling still needs implementation |
| J — Team colors | NO | 0/18 team details expose color fields |
| K — Remove FotMob runtime/catalogue dependency | PARTIAL | Core catalogue can use BSD if coverage passes; identity transition, role/palette decisions and XI replacement remain. Not a drop-in migration. |

Proceed only to a separately approved design phase: independent IDs + provider/legacy aliases, fresh BSD catalogue ingestion, explicit internal tactical-role/palette choices and BSD-only XI selection. Do not apply this audit as a migration.

References: [BSD teams/players endpoint documentation](https://sports.bzzoiro.com/docs/football/teams-players/), [BSD league/season documentation](https://sports.bzzoiro.com/docs/football/leagues/). Endpoint discovery used documentation; field and coverage claims above use actual authenticated GET responses.

### Audit execution and local validation

- `node scripts/audit-bsd-catalogue.mjs`: successful full live audit; 61 data-API requests in that initial invocation. A prior schema-only probe used 2 requests. The explicit value rechecks and supplemental role sample are itemized in section 14, bringing this task to 78 data-API GETs.
- The final script integrates the expanded role sample into its normal run; future run totals are counted from actual requests, not a hardcoded task total. It is not necessary to rerun the whole provider crawl to read this report.
- `node --check scripts/audit-bsd-catalogue.mjs`: passed.
- `node scripts/audit-bsd-catalogue.mjs --self-test`: passed, zero HTTP calls. Covers Turkish/Unicode/apostrophe/hyphen normalization, strong/medium/cross-team/no-match cases, ambiguity, many-to-one collisions, and explicit-versus-generic position codes.
- `git diff --check`: passed. `git diff --stat` is empty because existing tracked files are unchanged; the only untracked additions are this report and the audit script.
- Actual configured BSD token was checked against both new artifacts and was absent. Token values were never logged or written to artifacts. No media was downloaded.
- No Supabase/DB request, migration, existing-ID change, seed/roster edit, production mutation, commit, push or deploy.
- To rerun, use a terminal that inherits the Windows user environment and run `node scripts/audit-bsd-catalogue.mjs`. It rewrites only this audit report. If the token is absent from the process environment, it exits with `BSD_API_TOKEN is not available.`; it does not read secret files.
