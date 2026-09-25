# BSD Migration Blocker Audit — D1.1

Observed 2026-09-24T22:23:37.287Z UTC; Europe/Istanbul local audit date 25 September 2026. Read-only; D1 report preserved. No web search.

## 1. Executive summary

Scope: 18 teams, 543 unique BSD squad players, 543 successfully validated detail identities. specific_position populated: **543/543**. D1 cohorts reproduced: **YES** (HIGH/MEDIUM/ambiguous/legacy-only/BSD-only = 359/88/2/90/95).

New safe migration candidates among the 90 unmatched: **29**; unresolved under the stated safety threshold: **61**. MEDIUM promoted: **0**. Confirmed current-season latest XI: **18/18**. These are reviewable identity proposals, not production mappings or writes.

## 2. Exhaustive specific_position results

| Exact returned value | Count | Proposed product role | Mapping class |
| --- | --- | --- | --- |
| AM | 24 | OO | DIRECT |
| CB | 85 | STP | DIRECT |
| CM | 78 | MO | DIRECT |
| DEF | 23 | STP (explicit product default only) | LOSSY |
| DM | 11 | ÖL | DIRECT |
| FWD | 30 | SF (only an explicit product default) | LOSSY |
| GK | 68 | KL | DIRECT |
| LB | 34 | SLB | DIRECT |
| LM | 2 | SLK | LOSSY |
| LW | 32 | SLK | DIRECT |
| MID | 22 | MO (explicit product default only) | LOSSY |
| RB | 34 | SĞB | DIRECT |
| RM | 4 | SĞK | LOSSY |
| RW | 40 | SĞK | DIRECT |
| ST | 56 | SF | DIRECT |

Null/missing specific_position: 0; empty string: 0; failed/mismatched-ID details: 0. Unknown/unexpected codes after exhaustive semantic review: **0**. DEF (23) and MID (22) are recognized generic position labels, not detailed roles. Together with FWD (30), **75/543** populated values still convey only broad position.

Specific/broad conflicts use an explicit semantic table (GK→G, CB/LB/RB→D, CM/AM/DM→M, FWD/ST/CF→F; wingbacks and wingers allow documented broad ambiguity rather than guessing).

| BSD ID | Team | Player | Squad broad | Detail broad | specific_position |
| --- | --- | --- | --- | --- | --- |
| 5797 | Alanyaspor | Ianis Hagi | F | F | AM |
| 104616 | Alanyaspor | Şahin Dik | M | M | LB |
| 6902 | Alanyaspor | Yusuf Özdemir | M | M | LB |
| 5790 | Alanyaspor | Florent Hadergjonaj | M | M | RB |
| 3130 | Amed Sportif Faaliyetler | Yira Collins Sor | M | M | ST |
| 3739 | Çaykur Rizespor | Ahmed Kutucu | M | M | ST |
| 65053 | Çorum FK | Atakan Cangöz | M | M | RB |
| 6649 | Erzurumspor FK | Festy Ebosele | D | D | RM |
| 7729 | Göztepe | Alexis Antunes | F | F | AM |
| 5714 | Göztepe | Efkan Bekiroğlu | F | F | AM |
| 5722 | Göztepe | Ogün Bayrak | M | M | RB |
| 6360 | Kocaelispor | Metehan Altunbaş | M | M | ST |
| 8760 | Samsunspor | Jaures Assoumou | M | M | ST |

Squad/detail identity-field disagreements:

| BSD ID | Player | Squad team | Detail team ID | Squad/detail number | Squad/detail broad |
| --- | --- | --- | --- | --- | --- |



## 3. Role mapping feasibility

DIRECT = explicit semantic role code, with label translation only. LOSSY = product can choose a deterministic default but loses football detail or invents specificity. UNMAPPABLE = missing/unrecognized, must remain unknown. This is a proposal, not implemented mapping.

| BSD value | Product role proposal | Class | Confidence / notes |
| --- | --- | --- | --- |
| AM | OO | DIRECT | High semantic confidence; still only one primary role |
| CB | STP | DIRECT | High semantic confidence; still only one primary role |
| CM | MO | DIRECT | High semantic confidence; still only one primary role |
| DEF | STP (explicit product default only) | LOSSY | Low as a specific-role assignment: DEF cannot identify center-back versus full-back. Keep unknown unless product approves this default. |
| DM | ÖL | DIRECT | High semantic confidence; still only one primary role |
| FWD | SF (only an explicit product default) | LOSSY | Default requires product approval; not equivalent detail. FWD does not prove central striker versus winger. |
| GK | KL | DIRECT | High semantic confidence; still only one primary role |
| LB | SLB | DIRECT | High semantic confidence; still only one primary role |
| LM | SLK | LOSSY | Medium semantic approximation: wide midfielder and winger are different labels. |
| LW | SLK | DIRECT | High semantic confidence; still only one primary role |
| MID | MO (explicit product default only) | LOSSY | Low as a specific-role assignment: MID cannot identify defensive/central/attacking or wide midfield. Keep unknown unless product approves this default. |
| RB | SĞB | DIRECT | High semantic confidence; still only one primary role |
| RM | SĞK | LOSSY | Default requires product approval; not equivalent detail. FWD does not prove central striker versus winger. |
| RW | SĞK | DIRECT | High semantic confidence; still only one primary role |
| ST | SF | DIRECT | High semantic confidence; still only one primary role |

| Current role | Exact BSD evidence observed |
| --- | --- |
| KL | DIRECT code observed |
| STP | DIRECT code observed |
| SLB | DIRECT code observed |
| SĞB | DIRECT code observed |
| ÖL | DIRECT code observed |
| MO | DIRECT code observed |
| OO | DIRECT code observed |
| SLK | DIRECT code observed |
| SĞK | DIRECT code observed |
| SF | DIRECT code observed |

**462/543** records have a DIRECT specific-role code; **81/543** need an explicit LOSSY policy (75 generic DEF/MID/FWD plus 6 LM/RM). All ten product role types occur in the complete BSD data. DIRECT describes the role code, not a blanket approval of the 13 conflicting broad/specific records.

All values may fit a reduced product policy only if LOSSY defaults/unknowns are accepted. The existing multi-role arrays cannot be reconstructed from a single primary specific_position. Do not preserve FotMob roles as hidden fill data.

## 4. All legacy-only investigations

Safe candidate rule: unique provider-published full/short name, exact complete token reorder, or exact first+last tokens with middle-name expansion; same team; equal known 1–99 number; equal broad position; consistent BSD detail team/name/number/position; no existing D1 target claim and no competing new claim. Single-name matches, edit distance, surname similarity and cross-team hypotheses are never safe by themselves. Exact surname groups are disclosed even when they are not plausible identities.

No player is labelled LIKELY_LEFT_LEAGUE merely because absent. No external transfer lookup was made; no actual departure/transfer is asserted.

| Classification | Count |
| --- | --- |
| LIKELY_LEFT_LEAGUE | 0 |
| LIKELY_NAME_VARIANT | 60 |
| LIKELY_TRANSFER_WITHIN_LEAGUE | 0 |
| AMBIGUOUS | 0 |
| NO_SAFE_MATCH | 30 |

| Legacy ID | Legacy team/name | No./broad | Full normalized name anywhere | Same/near surname candidates | Best identity candidates / evidence | Classification | Safe candidate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2210579 | Beşiktaş / Azem Yortac | 63 / D | no | 59016 Mustafa Yortaç (Beşiktaş JK) | none | NO_SAFE_MATCH | NO |
| 1001348 | Beşiktaş / Kartal Yılmaz | 8 / M | no | 5832 Rıdvan Yılmaz (Beşiktaş JK); 5833 Kartal Kayra Yılmaz (Beşiktaş JK); 170277 Emirhan Yilmaz (Çaykur Rizespor); 6686 Arda Yılmaz (Galatasaray); 6355 Jankat Yılmaz (Galatasaray); 3734 Barış Alper Yılmaz (Galatasaray) | 5833 Beşiktaş JK / Kartal Kayra Yılmaz [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #8; M] | LIKELY_NAME_VARIANT | YES → 5833 |
| 1638880 | Beşiktaş / Fahri Ay | 68 / M | no | none | none | NO_SAFE_MATCH | NO |
| 1896214 | Beşiktaş / Ahmet Bircan | 70 / F | no | 8644 Ahmet Sami Bircan (Beşiktaş JK) | 8644 Beşiktaş JK / Ahmet Sami Bircan [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #70; F] | LIKELY_NAME_VARIANT | YES → 8644 |
| 798661 | Kocaelispor / Anfernee Dijksteel | 2 / D | no | 6576 Anfernee Jamal Dijksteel (Kocaelispor) | 6576 Kocaelispor / Anfernee Jamal Dijksteel [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #2; D] | LIKELY_NAME_VARIANT | YES → 6576 |
| 2160705 | Kocaelispor / Hulusi Destici | NULL / M | no | 93848 Sabahattin Destici (Gaziantep FK); 206421 Hulisi Destici (Kocaelispor) | 206421 Kocaelispor / Hulisi Destici [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #26; M] | LIKELY_NAME_VARIANT | NO |
| 1245179 | Kocaelispor / Habib Keïta | 8 / M | no | 6752 Sekou Koita (Gençlerbirliği) | none | NO_SAFE_MATCH | NO |
| 1093003 | Kocaelispor / Tobias Gulliksen | 8 / M | no | 16304 Tobias Fjeld Gulliksen (Kocaelispor) | 16304 Kocaelispor / Tobias Fjeld Gulliksen [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #8; M] | LIKELY_NAME_VARIANT | YES → 16304 |
| 1210041 | Kocaelispor / Uğur Yıldız | 22 / M | no | 6817 Ahmed Ildız (Çorum FK); 6881 Uğur Kaan Yıldız (Kocaelispor); 64124 Bedirhan Yıldız (Kocaelispor) | 6881 Kocaelispor / Uğur Kaan Yıldız [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #22; D] | LIKELY_NAME_VARIANT | NO |
| 614269 | Kocaelispor / Samet Yalçin | 23 / M | no | 5795 Güven Yalçın (Kasımpaşa) | none | NO_SAFE_MATCH | NO |
| 627223 | Kocaelispor / Daniel Agyei | 7 / F | no | 6567 Dan Agyei (Kocaelispor) | none | NO_SAFE_MATCH | NO |
| 1367959 | Göztepe / Mehmet Öztürk | 33 / G | no | 159830 Ege Öztürk (Başakşehir FK); 7025 Mehmet Şamil Öztürk (Göztepe) | 7025 Göztepe / Mehmet Şamil Öztürk [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #33; G] | LIKELY_NAME_VARIANT | YES → 7025 |
| 1304343 | Göztepe / Allan Godói | 3 / D | no | none | 5706 Göztepe / Allan [SINGLE_NAME_COMPONENT_REVIEW_ONLY; #3; D] | NO_SAFE_MATCH | NO |
| 1459652 | Göztepe / André | 7 / F | no | none | 617 Göztepe / André Henrique [SINGLE_NAME_COMPONENT_REVIEW_ONLY; #7; F] | NO_SAFE_MATCH | NO |
| 1118178 | Göztepe / Juan | 9 / F | no | none | 5715 Göztepe / Juan Santos da Silva [EXACT_PROVIDER_NAME_OR_PUBLISHED_SHORT_NAME; #9; F] | LIKELY_NAME_VARIANT | YES → 5715 |
| 889745 | Göztepe / Bekir Böke | 14 / F | no | 86870 Bekir Turaç Böke (Göztepe) | 86870 Göztepe / Bekir Turaç Böke [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #14; F] | LIKELY_NAME_VARIANT | YES → 86870 |
| 1304538 | Başakşehir / Francis Nzaba | NULL / D | no | none | none | NO_SAFE_MATCH | NO |
| 1138299 | Başakşehir / Ömer Beyaz | 17 / M | no | none | none | NO_SAFE_MATCH | NO |
| 1780234 | Başakşehir / Berkay Aslan | 45 / M | no | 13667 Cemilhan Aslan (Gaziantep FK); 52335 Erk Arda Aslan (Gençlerbirliği); 5706 Allan (Göztepe) | none | NO_SAFE_MATCH | NO |
| 1249993 | Başakşehir / Abbosbek Fayzullayev | 11 / F | no | 6642 Abbosbek Fayzullaev (Başakşehir FK) | 6642 Başakşehir FK / Abbosbek Fayzullaev [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #11; M] | LIKELY_NAME_VARIANT | NO |
| 1135987 | Çaykur Rizespor / Khusniddin Alikulov | 2 / D | no | 5865 Husniddin Aliqulov (Çaykur Rizespor) | 5865 Çaykur Rizespor / Husniddin Aliqulov [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #2; D] | LIKELY_NAME_VARIANT | NO |
| 1211804 | Çaykur Rizespor / Adedire Awokoya Mebude | 11 / F | no | 7551 Adedire Mebude (Çaykur Rizespor) | 7551 Çaykur Rizespor / Adedire Mebude [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #11; F] | LIKELY_NAME_VARIANT | YES → 7551 |
| 2106976 | Çaykur Rizespor / Mustafa Tosun | 80 / F | no | 86516 Mustafa Coskun Tosun (Çaykur Rizespor) | 86516 Çaykur Rizespor / Mustafa Coskun Tosun [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #80; F] | LIKELY_NAME_VARIANT | YES → 86516 |
| 2132142 | Erzurumspor FK / Omer Kara | NULL / D | no | 6727 Ibrahim Kaya (Alanyaspor); 8851 Mahmut Can Kara (Alanyaspor); 27415 Ömer Arda Kara (Erzurumspor FK); 3731 Gabriel Sara (Galatasaray); 41509 Fatih Kaya (Samsunspor) | 27415 Erzurumspor FK / Ömer Arda Kara [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #25; D] | LIKELY_NAME_VARIANT | NO |
| 1392225 | Erzurumspor FK / Nəriman Akhundzada | 90 / M | no | 3644 Nariman Akhundzade (Erzurumspor FK) | 3644 Erzurumspor FK / Nariman Akhundzade [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #90; F] | LIKELY_NAME_VARIANT | NO |
| 1217167 | Çorum FK / Polat Abay | NULL / M | no | none | none | NO_SAFE_MATCH | NO |
| 842682 | Çorum FK / Markus Seehusen Karlsbakk | 8 / M | no | 50238 Markus Karlsbakk (Çorum FK) | 50238 Çorum FK / Markus Karlsbakk [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #8; M] | LIKELY_NAME_VARIANT | YES → 50238 |
| 1064272 | Çorum FK / Mohamed Diomandé | 10 / M | no | 3018 Mohammed Diomande (Çorum FK) | 3018 Çorum FK / Mohammed Diomande [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #10; M] | LIKELY_NAME_VARIANT | NO |
| 2132134 | Çorum FK / Hasanege Akdogan | NULL / F | no | 65042 Hasan Ege Akdogan (Çorum FK) | none | NO_SAFE_MATCH | NO |
| 299358 | Çorum FK / Mame Baba Thiam | 9 / F | no | 6349 Mame Thiam (Çorum FK) | 6349 Çorum FK / Mame Thiam [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #9; F] | LIKELY_NAME_VARIANT | YES → 6349 |
| 1327848 | Çorum FK / Feyttullah Gürlük | 17 / F | no | 65046 Emircan Gürlük (Çorum FK) | none | NO_SAFE_MATCH | NO |
| 1766201 | Gaziantep FK / İbrahim Alkış | 95 / G | no | 7130 Ibrahim Kagan Alkis (Gaziantep FK); 97988 Sinan Alkas (Kasımpaşa) | 7130 Gaziantep FK / Ibrahim Kagan Alkis [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #95; G] | LIKELY_NAME_VARIANT | YES → 7130 |
| 1894907 | Gaziantep FK / Mervan Müjdeci | 83 / D | no | none | none | NO_SAFE_MATCH | NO |
| 1678863 | Gaziantep FK / Burak Yıkıcı | NULL / M | no | 65845 Burak Enes Yikici (Gaziantep FK) | 65845 Gaziantep FK / Burak Enes Yikici [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #85; M] | LIKELY_NAME_VARIANT | NO |
| 1755390 | Gaziantep FK / Taha Güneş | NULL / M | no | 6641 Umut Güneş (Başakşehir FK); 9021 Can Armando Güner (Galatasaray); 7072 Muhammet Taha Gunes (Gaziantep FK) | 7072 Gaziantep FK / Muhammet Taha Gunes [SHARED_NAME_TOKENS_REVIEW_ONLY; #93; M] | LIKELY_NAME_VARIANT | NO |
| 1788160 | Gaziantep FK / Yusuf Delen | NULL / M | no | none | none | NO_SAFE_MATCH | NO |
| 1637892 | Gaziantep FK / Victor Gidado | 8 / M | no | none | 8570 Gaziantep FK / Gidado Victor Ntino-Emo [SHARED_NAME_TOKENS_REVIEW_ONLY; #8; M] | LIKELY_NAME_VARIANT | NO |
| 861520 | Gaziantep FK / Florin Ștefan | 96 / M | no | none | none | NO_SAFE_MATCH | NO |
| 1665501 | Gaziantep FK / Ali Mevran Ablak | 16 / F | no | none | none | NO_SAFE_MATCH | NO |
| 1762856 | Gaziantep FK / Ali Kalın | 46 / F | no | 6677 Ali Osman Kalın (Gaziantep FK) | 6677 Gaziantep FK / Ali Osman Kalın [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #46; F] | LIKELY_NAME_VARIANT | YES → 6677 |
| 1894910 | Gaziantep FK / Muhammed Akmelek | 85 / F | no | 8571 Muhammet Akmelek (Gaziantep FK) | 8571 Gaziantep FK / Muhammet Akmelek [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #85; F] | LIKELY_NAME_VARIANT | NO |
| 1662153 | Alanyaspor / Mert Bayram | 23 / G | no | 5801 Mert Furkan Bayram (Alanyaspor); 7527 Emin Bayram (Başakşehir FK); 27418 Cengizhan Bayrak (Erzurumspor FK); 5722 Ogün Bayrak (Göztepe); 134918 Ömer Bayram (Kasımpaşa) | 5801 Alanyaspor / Mert Furkan Bayram [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #23; G] | LIKELY_NAME_VARIANT | YES → 5801 |
| 1402068 | Alanyaspor / Ruan | 11 / M | no | none | 5793 Alanyaspor / Ruan Pereira Duarte [SINGLE_NAME_COMPONENT_REVIEW_ONLY; #11; M] | NO_SAFE_MATCH | NO |
| 433677 | Alanyaspor / Ui-Jo Hwang | 16 / M | no | none | 5796 Alanyaspor / Hwang Ui-Jo [EXACT_FULL_TOKEN_REORDER; #16; F] | LIKELY_NAME_VARIANT | NO |
| 1398327 | Alanyaspor / Baran Gezek | 55 / M | no | 6352 Baran Ali Gezek (Alanyaspor) | 6352 Alanyaspor / Baran Ali Gezek [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #55; M] | LIKELY_NAME_VARIANT | YES → 6352 |
| 694060 | Alanyaspor / Meschack Elia | 12 / F | no | 6729 Meschak Elia (Alanyaspor) | 6729 Alanyaspor / Meschak Elia [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #12; F] | LIKELY_NAME_VARIANT | NO |
| 1813321 | Eyüpspor / Gilbert Mendy | 3 / D | no | 1551 Batista Mendy (Trabzonspor) | none | NO_SAFE_MATCH | NO |
| 1210344 | Eyüpspor / Anıl Yaşar | 4 / D | no | 8643 Emir Yaşar (Beşiktaş JK); 7133 Seyfettin Anıl Yaşar (Eyüpspor); 6880 Ali Emre Yanar (Kasımpaşa) | 7133 Eyüpspor / Seyfettin Anıl Yaşar [SHARED_NAME_TOKENS_REVIEW_ONLY; #4; D] | LIKELY_NAME_VARIANT | NO |
| 872726 | Eyüpspor / Mete Kaan Demir | 70 / M | no | 66906 Emre Demir (Alanyaspor); 8910 Dilhan Demir (Amed Sportif Faaliyetler); 206315 Yiğit Demir (Eyüpspor); 7097 Mete Demir (Eyüpspor); 3409 Yiğit Efe Demir (Fenerbahçe) | 7097 Eyüpspor / Mete Demir [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #70; M] | LIKELY_NAME_VARIANT | YES → 7097 |
| 2137178 | Eyüpspor / Musa Eren Karakas | NULL / F | no | 185694 Musa Karakas (Eyüpspor); 5681 Kazımcan Karataş (Galatasaray); 3425 Haydar Karataş (Kocaelispor) | 185694 Eyüpspor / Musa Karakas [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #53; F] | LIKELY_NAME_VARIANT | NO |
| 820085 | Kasımpaşa / Ali Yanar | 25 / G | no | 8643 Emir Yaşar (Beşiktaş JK); 7133 Seyfettin Anıl Yaşar (Eyüpspor); 6880 Ali Emre Yanar (Kasımpaşa) | 6880 Kasımpaşa / Ali Emre Yanar [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #25; G] | LIKELY_NAME_VARIANT | YES → 6880 |
| 1670593 | Kasımpaşa / Şant Kazancı | 98 / G | no | none | none | NO_SAFE_MATCH | NO |
| 1437464 | Kasımpaşa / Jakob Vestergaard Jessen | 5 / D | no | 74284 Jakob Jessen (Kasımpaşa) | 74284 Kasımpaşa / Jakob Jessen [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #5; D] | LIKELY_NAME_VARIANT | YES → 74284 |
| 239626 | Kasımpaşa / Kamil Cörekci | 22 / D | no | 8610 Kamil Ahmet Çörekçi (Kasımpaşa) | 8610 Kasımpaşa / Kamil Ahmet Çörekçi [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #22; D] | LIKELY_NAME_VARIANT | YES → 8610 |
| 2175248 | Kasımpaşa / Ahmet Salih | 24 / D | no | 333 Mohamed Salah (Trabzonspor) | none | NO_SAFE_MATCH | NO |
| 1197741 | Kasımpaşa / Matei Cristian Ilie | 27 / D | no | 11634 Matei Ilie (Kasımpaşa) | 11634 Kasımpaşa / Matei Ilie [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #27; D] | LIKELY_NAME_VARIANT | YES → 11634 |
| 1489024 | Kasımpaşa / Taylan Aydın | 29 / D | no | 3412 Oğuz Aydın (Fenerbahçe); 5728 Eyüp Aydın (Galatasaray); 5701 Taylan Utku Aydın (Kasımpaşa); 7129 Egemen Aydin (Konyaspor) | 5701 Kasımpaşa / Taylan Utku Aydın [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #29; D] | LIKELY_NAME_VARIANT | YES → 5701 |
| 1398128 | Kasımpaşa / Oğuzhan Yılmaz | NULL / M | no | 5832 Rıdvan Yılmaz (Beşiktaş JK); 5833 Kartal Kayra Yılmaz (Beşiktaş JK); 170277 Emirhan Yilmaz (Çaykur Rizespor); 6686 Arda Yılmaz (Galatasaray); 6355 Jankat Yılmaz (Galatasaray); 3734 Barış Alper Yılmaz (Galatasaray) | none | NO_SAFE_MATCH | NO |
| 1595606 | Kasımpaşa / Elson Mendes Da Silva | 51 / M | no | 5715 Juan Santos da Silva (Göztepe) | 22080 Kasımpaşa / Elson Mendes [SHARED_NAME_TOKENS_REVIEW_ONLY; #51; M] | LIKELY_NAME_VARIANT | NO |
| 997497 | Kasımpaşa / Ali Kol | 7 / F | no | 5697 Ali Yavuz Kol (Kasımpaşa) | 5697 Kasımpaşa / Ali Yavuz Kol [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #7; F] | LIKELY_NAME_VARIANT | YES → 5697 |
| 2130621 | Kasımpaşa / Muhammed Emin Bektash | 99 / F | no | 147993 Muhammed Bektaş (Kasımpaşa) | 147993 Kasımpaşa / Muhammed Bektaş [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #99; F] | LIKELY_NAME_VARIANT | NO |
| 2132150 | Gençlerbirliği / Berk Cukurcu | NULL / G | no | 36110 Berk Deniz Çukurcu (Gençlerbirliği) | 36110 Gençlerbirliği / Berk Deniz Çukurcu [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #19; G] | LIKELY_NAME_VARIANT | NO |
| 707777 | Gençlerbirliği / İrfan Eğribayat | 70 / G | no | 3422 İrfan Can Eğribayat (Gençlerbirliği) | 3422 Gençlerbirliği / İrfan Can Eğribayat [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #70; G] | LIKELY_NAME_VARIANT | YES → 3422 |
| 1801058 | Gençlerbirliği / Hamza Aydar | 3 / D | no | 7011 Yiğit Hamza Aydar (Gençlerbirliği) | 7011 Gençlerbirliği / Yiğit Hamza Aydar [SHARED_NAME_TOKENS_REVIEW_ONLY; #3; D] | LIKELY_NAME_VARIANT | NO |
| 282615 | Gençlerbirliği / Dimitrios Goutas | 6 / D | no | 6748 Dimitris Goutas (Gençlerbirliği) | 6748 Gençlerbirliği / Dimitris Goutas [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #6; D] | LIKELY_NAME_VARIANT | NO |
| 1794421 | Gençlerbirliği / Emirhan Unal | 27 / D | no | none | none | NO_SAFE_MATCH | NO |
| 1794424 | Gençlerbirliği / Arda Çelik | 44 / D | no | 6895 İzzet Çelik (Alanyaspor); 95721 Batuhan Çelik (Başakşehir FK); 64602 Erdem Çalık (Eyüpspor); 8624 Arda Cagan Celik (Gençlerbirliği) | 8624 Gençlerbirliği / Arda Cagan Celik [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #44; D] | LIKELY_NAME_VARIANT | YES → 8624 |
| 1240708 | Gençlerbirliği / Moussa Kyabou | 18 / M | no | none | none | NO_SAFE_MATCH | NO |
| 547710 | Gençlerbirliği / Adama Traoré | 14 / F | no | 7057 Adama Malouda Traoré (Gençlerbirliği) | 7057 Gençlerbirliği / Adama Malouda Traoré [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #14; M] | LIKELY_NAME_VARIANT | NO |
| 1984830 | Gençlerbirliği / Erk Aslan | 17 / F | no | 13667 Cemilhan Aslan (Gaziantep FK); 52335 Erk Arda Aslan (Gençlerbirliği); 5706 Allan (Göztepe) | 52335 Gençlerbirliği / Erk Arda Aslan [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #17; F] | LIKELY_NAME_VARIANT | YES → 52335 |
| 1895450 | Gençlerbirliği / Prince Martor Jr. | 45 / F | no | none | 8625 Gençlerbirliği / Prince Martor [SHARED_NAME_TOKENS_REVIEW_ONLY; #45; F] | LIKELY_NAME_VARIANT | NO |
| 2140571 | Konyaspor / Alpha Fofana | NULL / D | no | 6738 Yahia Fofana (Çaykur Rizespor) | none | NO_SAFE_MATCH | NO |
| 2133064 | Fenerbahçe / Kuzey Sapaz | 75 / G | no | 65693 Veysel Sapan (Amed Sportif Faaliyetler) | none | NO_SAFE_MATCH | NO |
| 316544 | Fenerbahçe / İrfan Kahveci | 17 / F | no | 4577 İrfan Can Kahveci (Fenerbahçe) | 4577 Fenerbahçe / İrfan Can Kahveci [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #17; M] | LIKELY_NAME_VARIANT | NO |
| 938416 | Amedspor / Mustafa Burak Bozan | 27 / G | no | 6673 Burak Bozan (Amed Sportif Faaliyetler) | 6673 Amed Sportif Faaliyetler / Burak Bozan [SHARED_NAME_TOKENS_REVIEW_ONLY; #27; G] | LIKELY_NAME_VARIANT | NO |
| 470399 | Amedspor / David Bates | 4 / D | no | 7642 David Robert Bates (Amed Sportif Faaliyetler) | 7642 Amed Sportif Faaliyetler / David Robert Bates [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #4; D] | LIKELY_NAME_VARIANT | YES → 7642 |
| 1054011 | Amedspor / Collins Sor | 11 / F | no | 3130 Yira Collins Sor (Amed Sportif Faaliyetler) | 3130 Amed Sportif Faaliyetler / Yira Collins Sor [SHARED_NAME_TOKENS_REVIEW_ONLY; #11; M] | LIKELY_NAME_VARIANT | NO |
| 1797560 | Samsunspor / Efe Üstün | 13 / G | no | 13613 Efe Yiğit Üstün (Samsunspor) | 13613 Samsunspor / Efe Yiğit Üstün [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #13; G] | LIKELY_NAME_VARIANT | YES → 13613 |
| 1677480 | Samsunspor / Efe Töruz | 48 / G | no | 5740 Efe Berat Törüz (Samsunspor) | 5740 Samsunspor / Efe Berat Törüz [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #NULL; G] | LIKELY_NAME_VARIANT | NO |
| 1436939 | Samsunspor / Oskar Öhlenschlaeger | NULL / M | no | 12780 Oskar Øhlenschlaeger (Samsunspor) | 12780 Samsunspor / Oskar Øhlenschlaeger [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #20; M] | LIKELY_NAME_VARIANT | NO |
| 1666481 | Samsunspor / Anto Sekongo | 42 / M | no | 38085 Antoine Sekongo (Samsunspor) | none | NO_SAFE_MATCH | NO |
| 1609641 | Samsunspor / Alper Pazar | NULL / F | no | 37209 Alper Efe Pazar (Samsunspor) | 37209 Samsunspor / Alper Efe Pazar [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #12; M] | LIKELY_NAME_VARIANT | NO |
| 953517 | Samsunspor / Marius Mouandilmadji | 9 / F | no | none | none | NO_SAFE_MATCH | NO |
| 1514682 | Samsunspor / Kouadou Assoumou | 47 / F | no | 8760 Jaures Assoumou (Samsunspor) | none | NO_SAFE_MATCH | NO |
| 1677467 | Trabzonspor / Ahmet Yıldırım | 1 / G | no | 65682 Muhammed Yıldırım (Amed Sportif Faaliyetler); 4786 Bertuğ Yıldırım (Başakşehir FK); 7125 Ege Yildirim (Göztepe); 6625 Ahmet Doğan Yıldırım (Trabzonspor) | 6625 Trabzonspor / Ahmet Doğan Yıldırım [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #1; G] | LIKELY_NAME_VARIANT | YES → 6625 |
| 1752855 | Trabzonspor / Erol Çolak | 96 / G | no | 37416 Erol Can Çolak (Trabzonspor) | 37416 Trabzonspor / Erol Can Çolak [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION; #96; G] | LIKELY_NAME_VARIANT | YES → 37416 |
| 1037491 | Trabzonspor / Arseniy Batahov | 44 / D | no | 6612 Arseniy Batagov (Trabzonspor) | 6612 Trabzonspor / Arseniy Batagov [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #44; D] | LIKELY_NAME_VARIANT | NO |
| 459658 | Trabzonspor / Ruslan Malinovsky | 17 / M | no | 2593 Ruslan Malinovskyi (Trabzonspor) | 2593 Trabzonspor / Ruslan Malinovskyi [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY; #17; M] | LIKELY_NAME_VARIANT | NO |
| 1374500 | Trabzonspor / Franculino | 9 / F | no | none | 3250 Trabzonspor / Franculino Djú [SINGLE_NAME_COMPONENT_REVIEW_ONLY; #9; F] | NO_SAFE_MATCH | NO |
| 411605 | Trabzonspor / Mehmet Umut Nayir | 14 / F | no | 5717 Furkan Bayır (Göztepe); 6490 Umut Nayir (Trabzonspor) | 6490 Trabzonspor / Umut Nayir [SHARED_NAME_TOKENS_REVIEW_ONLY; #14; F] | LIKELY_NAME_VARIANT | NO |


## 5. All BSD-only investigations

| BSD ID | Team/name | Number | Broad | specific_position | Legacy normalized-name match | Candidate classification | Possible legacy variants |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6729 | Alanyaspor / Meschak Elia | 12 | F | ST | no | possible legacy name variant | 694060 Alanyaspor / Meschack Elia [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 5796 | Alanyaspor / Hwang Ui-Jo | 16 | F | ST | no | possible legacy name variant | 433677 Alanyaspor / Ui-Jo Hwang [EXACT_FULL_TOKEN_REORDER] |
| 5801 | Alanyaspor / Mert Furkan Bayram | 23 | G | GK | no | possible legacy name variant | 1662153 Alanyaspor / Mert Bayram [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 5793 | Alanyaspor / Ruan Pereira Duarte | 11 | M | LM | no | possible legacy name variant | 1402068 Alanyaspor / Ruan [SINGLE_NAME_COMPONENT_REVIEW_ONLY] |
| 6352 | Alanyaspor / Baran Ali Gezek | 55 | M | CM | no | possible legacy name variant | 1398327 Alanyaspor / Baran Gezek [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 7642 | Amed Sportif Faaliyetler / David Robert Bates | 4 | D | CB | no | possible legacy name variant | 470399 Amedspor / David Bates [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 6673 | Amed Sportif Faaliyetler / Burak Bozan | 27 | G | GK | no | possible legacy name variant | 938416 Amedspor / Mustafa Burak Bozan [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 208569 | Amed Sportif Faaliyetler / Muhammed Damar | 95 | G | GK | no | no legacy normalized-name match | none |
| 3130 | Amed Sportif Faaliyetler / Yira Collins Sor | 11 | M | ST | no | possible legacy name variant | 1054011 Amedspor / Collins Sor [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 92692 | Amed Sportif Faaliyetler / Hüseyin Ülgüt | NULL | M | MID | no | no legacy normalized-name match | none |
| 127578 | Başakşehir FK / Efe Arda Koyuncu | NULL | D | CB | no | no legacy normalized-name match | none |
| 159830 | Başakşehir FK / Ege Öztürk | 80 | G | GK | no | no legacy normalized-name match | none |
| 6642 | Başakşehir FK / Abbosbek Fayzullaev | 11 | M | MID | no | possible legacy name variant | 1249993 Başakşehir / Abbosbek Fayzullayev [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 59016 | Beşiktaş JK / Mustafa Yortaç | 63 | D | CB | no | no legacy normalized-name match | none |
| 8644 | Beşiktaş JK / Ahmet Sami Bircan | 70 | F | FWD | no | possible legacy name variant | 1896214 Beşiktaş / Ahmet Bircan [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 5833 | Beşiktaş JK / Kartal Kayra Yılmaz | 8 | M | CM | no | possible legacy name variant | 1001348 Beşiktaş / Kartal Yılmaz [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 214112 | Beşiktaş JK / Élan Joshep Ricardo Ochoa | NULL | M | MID | no | no legacy normalized-name match | none |
| 5865 | Çaykur Rizespor / Husniddin Aliqulov | 2 | D | CB | no | possible legacy name variant | 1135987 Çaykur Rizespor / Khusniddin Alikulov [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 6739 | Çaykur Rizespor / Yakup Ayan | 94 | D | DEF | no | no legacy normalized-name match | none |
| 7551 | Çaykur Rizespor / Adedire Mebude | 11 | F | RW | no | possible legacy name variant | 1211804 Çaykur Rizespor / Adedire Awokoya Mebude [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 86516 | Çaykur Rizespor / Mustafa Coskun Tosun | 80 | F | FWD | no | possible legacy name variant | 2106976 Çaykur Rizespor / Mustafa Tosun [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 185592 | Çaykur Rizespor / Hasan Yağız Döne | NULL | G | GK | no | no legacy normalized-name match | none |
| 97934 | Çaykur Rizespor / Muhammed Baltaci | 96 | M | MID | no | no legacy normalized-name match | none |
| 65042 | Çorum FK / Hasan Ege Akdogan | 7 | F | ST | no | no legacy normalized-name match | none |
| 6349 | Çorum FK / Mame Thiam | 9 | F | ST | no | possible legacy name variant | 299358 Çorum FK / Mame Baba Thiam [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 50238 | Çorum FK / Markus Karlsbakk | 8 | M | CM | no | possible legacy name variant | 842682 Çorum FK / Markus Seehusen Karlsbakk [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 3018 | Çorum FK / Mohammed Diomande | 10 | M | CM | no | possible legacy name variant | 1064272 Çorum FK / Mohamed Diomandé [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 65046 | Çorum FK / Emircan Gürlük | 17 | M | LW | no | no legacy normalized-name match | none |
| 65053 | Çorum FK / Atakan Cangöz | NULL | M | RB | no | no legacy normalized-name match | none |
| 27415 | Erzurumspor FK / Ömer Arda Kara | 25 | D | CB | no | possible legacy name variant | 2132142 Erzurumspor FK / Omer Kara [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 185687 | Erzurumspor FK / Yigit Baran Karaoglan | 55 | D | DEF | no | no legacy normalized-name match | none |
| 3644 | Erzurumspor FK / Nariman Akhundzade | 90 | F | ST | no | possible legacy name variant | 1392225 Erzurumspor FK / Nəriman Akhundzada [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 144497 | Erzurumspor FK / Kerem Erener | NULL | F | FWD | no | no legacy normalized-name match | none |
| 7133 | Eyüpspor / Seyfettin Anıl Yaşar | 4 | D | CB | no | possible legacy name variant | 1210344 Eyüpspor / Anıl Yaşar [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 10579 | Eyüpspor / Ömer Ahmet Ceyhan | 44 | D | DEF | no | no legacy normalized-name match | none |
| 185694 | Eyüpspor / Musa Karakas | 53 | F | FWD | no | possible legacy name variant | 2137178 Eyüpspor / Musa Eren Karakas [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 7097 | Eyüpspor / Mete Demir | 70 | M | RW | no | possible legacy name variant | 872726 Eyüpspor / Mete Kaan Demir [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 52334 | Fenerbahçe / Emin Eren Sayar | 16 | F | RW | no | no legacy normalized-name match | none |
| 4577 | Fenerbahçe / İrfan Can Kahveci | 17 | M | RW | no | possible legacy name variant | 316544 Fenerbahçe / İrfan Kahveci [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 6686 | Galatasaray / Arda Yılmaz | 1 | G | GK | no | no legacy normalized-name match | none |
| 6677 | Gaziantep FK / Ali Osman Kalın | 46 | F | FWD | no | possible legacy name variant | 1762856 Gaziantep FK / Ali Kalın [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 8571 | Gaziantep FK / Muhammet Akmelek | 85 | F | FWD | no | possible legacy name variant | 1894910 Gaziantep FK / Muhammed Akmelek [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 211261 | Gaziantep FK / Kadir Gümüş | NULL | F | FWD | no | no legacy normalized-name match | none |
| 7130 | Gaziantep FK / Ibrahim Kagan Alkis | 95 | G | GK | no | possible legacy name variant | 1766201 Gaziantep FK / İbrahim Alkış [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 8570 | Gaziantep FK / Gidado Victor Ntino-Emo | 8 | M | CM | no | possible legacy name variant | 1637892 Gaziantep FK / Victor Gidado [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 65845 | Gaziantep FK / Burak Enes Yikici | 85 | M | MID | no | possible legacy name variant | 1678863 Gaziantep FK / Burak Yıkıcı [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 7072 | Gaziantep FK / Muhammet Taha Gunes | 93 | M | MID | no | possible legacy name variant | 1755390 Gaziantep FK / Taha Güneş [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 7011 | Gençlerbirliği / Yiğit Hamza Aydar | 3 | D | DEF | no | possible legacy name variant | 1801058 Gençlerbirliği / Hamza Aydar [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 6748 | Gençlerbirliği / Dimitris Goutas | 6 | D | CB | no | possible legacy name variant | 282615 Gençlerbirliği / Dimitrios Goutas [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 64043 | Gençlerbirliği / Berat Can Sebat | 22 | D | DEF | no | no legacy normalized-name match | none |
| 8624 | Gençlerbirliği / Arda Cagan Celik | 44 | D | DEF | no | possible legacy name variant | 1794424 Gençlerbirliği / Arda Çelik [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 52335 | Gençlerbirliği / Erk Arda Aslan | 17 | F | FWD | no | possible legacy name variant | 1984830 Gençlerbirliği / Erk Aslan [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 8625 | Gençlerbirliği / Prince Martor | 45 | F | FWD | no | possible legacy name variant | 1895450 Gençlerbirliği / Prince Martor Jr. [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 36110 | Gençlerbirliği / Berk Deniz Çukurcu | 19 | G | GK | no | possible legacy name variant | 2132150 Gençlerbirliği / Berk Cukurcu [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 3422 | Gençlerbirliği / İrfan Can Eğribayat | 70 | G | GK | no | possible legacy name variant | 707777 Gençlerbirliği / İrfan Eğribayat [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 7057 | Gençlerbirliği / Adama Malouda Traoré | 14 | M | RW | no | possible legacy name variant | 547710 Gençlerbirliği / Adama Traoré [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 5706 | Göztepe / Allan | 3 | D | CB | no | possible legacy name variant | 1304343 Göztepe / Allan Godói [SINGLE_NAME_COMPONENT_REVIEW_ONLY] |
| 617 | Göztepe / André Henrique | 7 | F | ST | no | possible legacy name variant | 1459652 Göztepe / André [SINGLE_NAME_COMPONENT_REVIEW_ONLY] |
| 5715 | Göztepe / Juan Santos da Silva | 9 | F | ST | no | possible legacy name variant | 1118178 Göztepe / Juan [EXACT_PROVIDER_NAME_OR_PUBLISHED_SHORT_NAME] |
| 86870 | Göztepe / Bekir Turaç Böke | 14 | F | ST | no | possible legacy name variant | 889745 Göztepe / Bekir Böke [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 7025 | Göztepe / Mehmet Şamil Öztürk | 33 | G | GK | no | possible legacy name variant | 1367959 Göztepe / Mehmet Öztürk [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 74284 | Kasımpaşa / Jakob Jessen | 5 | D | LB | no | possible legacy name variant | 1437464 Kasımpaşa / Jakob Vestergaard Jessen [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 8610 | Kasımpaşa / Kamil Ahmet Çörekçi | 22 | D | RB | no | possible legacy name variant | 239626 Kasımpaşa / Kamil Cörekci [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 159933 | Kasımpaşa / Salih Arici | 24 | D | DEF | no | no legacy normalized-name match | none |
| 11634 | Kasımpaşa / Matei Ilie | 27 | D | CB | no | possible legacy name variant | 1197741 Kasımpaşa / Matei Cristian Ilie [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 5701 | Kasımpaşa / Taylan Utku Aydın | 29 | D | CB | no | possible legacy name variant | 1489024 Kasımpaşa / Taylan Aydın [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 5697 | Kasımpaşa / Ali Yavuz Kol | 7 | F | LW | no | possible legacy name variant | 997497 Kasımpaşa / Ali Kol [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 65433 | Kasımpaşa / Mecit Deniz | 35 | F | FWD | no | no legacy normalized-name match | none |
| 5703 | Kasımpaşa / Emirhan Yiğit | 42 | F | RW | no | no legacy normalized-name match | none |
| 147993 | Kasımpaşa / Muhammed Bektaş | 99 | F | FWD | no | possible legacy name variant | 2130621 Kasımpaşa / Muhammed Emin Bektash [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 65434 | Kasımpaşa / Stann Élysée Dalo | 99 | F | FWD | no | no legacy normalized-name match | none |
| 6880 | Kasımpaşa / Ali Emre Yanar | 25 | G | GK | no | possible legacy name variant | 820085 Kasımpaşa / Ali Yanar [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 22080 | Kasımpaşa / Elson Mendes | 51 | M | CM | no | possible legacy name variant | 1595606 Kasımpaşa / Elson Mendes Da Silva [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 6576 | Kocaelispor / Anfernee Jamal Dijksteel | 2 | D | RB | no | possible legacy name variant | 798661 Kocaelispor / Anfernee Dijksteel [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 13528 | Kocaelispor / Deniz Ceylan | 16 | D | DEF | no | no legacy normalized-name match | none |
| 6881 | Kocaelispor / Uğur Kaan Yıldız | 22 | D | RB | no | possible legacy name variant | 1210041 Kocaelispor / Uğur Yıldız [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 6567 | Kocaelispor / Dan Agyei | 7 | F | RW | no | no legacy normalized-name match | none |
| 16304 | Kocaelispor / Tobias Fjeld Gulliksen | 8 | M | AM | no | possible legacy name variant | 1093003 Kocaelispor / Tobias Gulliksen [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 206421 | Kocaelispor / Hulisi Destici | 26 | M | MID | no | possible legacy name variant | 2160705 Kocaelispor / Hulusi Destici [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 30731 | Konyaspor / Ata Yanık | 16 | D | CB | no | no legacy normalized-name match | none |
| 97937 | Konyaspor / Emir Gündoğdu | 66 | G | GK | no | no legacy normalized-name match | none |
| 6820 | Konyaspor / Mücahit Ibrahimoglu | 24 | M | CM | no | no legacy normalized-name match | none |
| 13613 | Samsunspor / Efe Yiğit Üstün | 13 | G | GK | no | possible legacy name variant | 1797560 Samsunspor / Efe Üstün [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 5740 | Samsunspor / Efe Berat Törüz | NULL | G | GK | no | possible legacy name variant | 1677480 Samsunspor / Efe Töruz [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 37209 | Samsunspor / Alper Efe Pazar | 12 | M | MID | no | possible legacy name variant | 1609641 Samsunspor / Alper Pazar [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 12780 | Samsunspor / Oskar Øhlenschlaeger | 20 | M | CM | no | possible legacy name variant | 1436939 Samsunspor / Oskar Öhlenschlaeger [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 37210 | Samsunspor / Eyup Degirmenci | 21 | M | MID | no | no legacy normalized-name match | none |
| 38085 | Samsunspor / Antoine Sekongo | 42 | M | AM | no | no legacy normalized-name match | none |
| 8760 | Samsunspor / Jaures Assoumou | 47 | M | ST | no | no legacy normalized-name match | none |
| 6612 | Trabzonspor / Arseniy Batagov | 44 | D | CB | no | possible legacy name variant | 1037491 Trabzonspor / Arseniy Batahov [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |
| 3250 | Trabzonspor / Franculino Djú | 9 | F | ST | no | possible legacy name variant | 1374500 Trabzonspor / Franculino [SINGLE_NAME_COMPONENT_REVIEW_ONLY] |
| 6490 | Trabzonspor / Umut Nayir | 14 | F | ST | no | possible legacy name variant | 411605 Trabzonspor / Mehmet Umut Nayir [SHARED_NAME_TOKENS_REVIEW_ONLY] |
| 6625 | Trabzonspor / Ahmet Doğan Yıldırım | 1 | G | GK | no | possible legacy name variant | 1677467 Trabzonspor / Ahmet Yıldırım [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 37416 | Trabzonspor / Erol Can Çolak | 96 | G | GK | no | possible legacy name variant | 1752855 Trabzonspor / Erol Çolak [EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION] |
| 2593 | Trabzonspor / Ruslan Malinovskyi | 17 | M | CM | no | possible legacy name variant | 459658 Trabzonspor / Ruslan Malinovsky [SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY] |

BSD-only means the D1 full-normalized-name algorithm found no match, not proven new signing. Safe pairs from section 4 resolve identities; other possible variants remain proposals.

## 6. All MEDIUM mappings

| Legacy ID/player | Legacy team | BSD ID/player | BSD team | Legacy # | BSD # | Legacy broad | BSD broad | Detail specific | Reason MEDIUM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1251666 Ernest Poku | Beşiktaş | 2144 Ernest Poku | Beşiktaş JK | 17 | 17 | M | F | RW | broad position differs |
| 1073569 Can Keleş | Beşiktaş | 6573 Can Keleş | Beşiktaş JK | NULL | 25 | F | F | RW | legacy number missing |
| 660165 Milot Rashica | Beşiktaş | 5836 Milot Rashica | Beşiktaş JK | 7 | 7 | F | M | MID | broad position differs |
| 623540 Václav Cerny | Beşiktaş | 4784 Václav Černý | Beşiktaş JK | 18 | 18 | F | M | RW | broad position differs |
| 1642084 İlhan Fakılı | Beşiktaş | 27113 İlhan Fakılı | Beşiktaş JK | 29 | 29 | F | M | LW | broad position differs |
| 2068249 Talha Polat | Kocaelispor | 86698 Talha Polat | Kocaelispor | NULL | NULL | G | G | GK | legacy number missing; BSD squad number missing |
| 1806118 Mikdat Cil | Kocaelispor | 64126 Mikdat Çil | Kocaelispor | NULL | 44 | D | D | DEF | legacy number missing |
| 1857520 Haydar Karataş | Kocaelispor | 3425 Haydar Karataş | Kocaelispor | 19 | 19 | M | F | FWD | broad position differs |
| 975117 Metehan Altunbaş | Kocaelispor | 6360 Metehan Altunbaş | Kocaelispor | 26 | 26 | F | M | ST | broad position differs |
| 862718 Makana Baku | Kocaelispor | 11290 Makana Baku | Kocaelispor | 32 | 32 | F | M | RW | broad position differs |
| 850311 Rigoberto Rivas | Kocaelispor | 6571 Rigoberto Rivas | Kocaelispor | 99 | 99 | F | M | RW | broad position differs |
| 864556 Alexis Antunes | Göztepe | 7729 Alexis Antunes | Göztepe | 8 | 8 | M | F | AM | broad position differs |
| 678812 Efkan Bekiroğlu | Göztepe | 5714 Efkan Bekiroğlu | Göztepe | 10 | 10 | M | F | AM | broad position differs |
| 1642791 Ibrahim Sabra | Göztepe | 5716 Ibrahim Sabra | Göztepe | NULL | 7 | F | F | ST | legacy number missing |
| 619513 Eldor Shomurodov | Başakşehir | 6643 Eldor Shomurodov | Başakşehir FK | 14 | 14 | M | F | FWD | broad position differs |
| 1339815 Batuhan Çelik | Başakşehir | 95721 Batuhan Çelik | Başakşehir FK | NULL | 91 | F | F | ST | legacy number missing |
| 863858 Yusuf Sarı | Başakşehir | 6901 Yusuf Sarı | Başakşehir FK | 7 | 7 | F | M | RW | broad position differs |
| 199302 Edin Višća | Başakşehir | 6849 Edin Višća | Başakşehir FK | 34 | 7 | F | M | RW | number changed; broad position differs |
| 861932 Andreas Skov Olsen | Başakşehir | 1384 Andreas Skov Olsen | Başakşehir FK | 70 | 70 | F | M | RW | broad position differs |
| 1647537 Habil Özbakir | Çaykur Rizespor | 65745 Habil Özbakir | Çaykur Rizespor | 95 | 21 | D | D | DEF | number changed |
| 940086 Can Bozdoğan | Çaykur Rizespor | 2995 Can Bozdoğan | Çaykur Rizespor | NULL | 70 | M | M | CM | legacy number missing |
| 1030646 Gennaro Borrelli | Çaykur Rizespor | 2207 Gennaro Borrelli | Çaykur Rizespor | NULL | 29 | F | F | ST | legacy number missing |
| 890266 Valentin Mihăilă | Çaykur Rizespor | 6740 Valentin Mihăilă | Çaykur Rizespor | 7 | 7 | F | M | LW | broad position differs |
| 887139 Ahmed Kutucu | Çaykur Rizespor | 3739 Ahmed Kutucu | Çaykur Rizespor | 23 | 23 | F | M | ST | broad position differs |
| 2132144 Serefhan Saglik | Erzurumspor FK | 35960 Şerefhan Sağlık | Erzurumspor FK | NULL | 96 | G | G | GK | legacy number missing |
| 2132143 Emre Erdem | Erzurumspor FK | 63118 Emre Erdem | Erzurumspor FK | NULL | 35 | D | D | DEF | legacy number missing |
| 1722760 Taha Rencber | Erzurumspor FK | 65059 Taha Rençber | Erzurumspor FK | NULL | 44 | D | D | DEF | legacy number missing |
| 1899931 Emirhan Acar | Erzurumspor FK | 210346 Emirhan Acar | Erzurumspor FK | NULL | 30 | M | M | CM | legacy number missing |
| 673749 Miguel Cardoso | Erzurumspor FK | 6510 Miguel Cardoso | Erzurumspor FK | 20 | 20 | F | M | LW | broad position differs |
| 1804781 Mustafa Fettahoğlu | Erzurumspor FK | 27403 Mustafa Fettahoglu | Erzurumspor FK | 99 | 99 | F | M | LW | broad position differs |
| 2023424 Arif Simsir | Çorum FK | 65062 Arif Şimşir | Çorum FK | NULL | 54 | G | G | GK | legacy number missing |
| 749489 Atakan Akkaynak | Çorum FK | 65048 Atakan Akkaynak | Çorum FK | NULL | 8 | M | M | AM | legacy number missing |
| 1030799 Furkan Çetinkaya | Çorum FK | 185632 Furkan Çetinkaya | Çorum FK | NULL | 45 | M | M | MID | legacy number missing |
| 603477 Cengiz Ünder | Çorum FK | 6784 Cengiz Ünder | Çorum FK | 7 | 7 | F | M | RW | broad position differs |
| 1183141 Göktan Gürpüz | Çorum FK | 6753 Göktan Gürpüz | Çorum FK | 21 | 21 | F | M | AM | broad position differs |
| 962786 Fuat Bavuk | Gaziantep FK | 65844 Fuat Bavuk | Gaziantep FK | 97 | 97 | D | F | FWD | broad position differs |
| 1717397 Karamba Gassama | Gaziantep FK | 8569 Karamba Gassama | Gaziantep FK | 17 | 17 | F | M | CM | broad position differs |
| 1269943 Enver Kulašin | Gaziantep FK | 6676 Enver Kulašin | Gaziantep FK | 27 | 27 | F | M | RW | broad position differs |
| 2132117 Bilal Demirag | Alanyaspor | 185437 Bilal Demirağ | Alanyaspor | NULL | NULL | D | D | CB | legacy number missing; BSD squad number missing |
| 1364337 Şahin Dik | Alanyaspor | 104616 Şahin Dik | Alanyaspor | NULL | 17 | D | M | LB | legacy number missing; broad position differs |
| 1300869 İbrahim Kaya | Alanyaspor | 6727 Ibrahim Kaya | Alanyaspor | 7 | 7 | M | F | LW | broad position differs |
| 645107 Ianis Hagi | Alanyaspor | 5797 Ianis Hagi | Alanyaspor | 10 | 10 | M | F | AM | broad position differs |
| 1111753 Emre Demir | Alanyaspor | 66906 Emre Demir | Alanyaspor | NULL | 14 | F | M | LW | legacy number missing; broad position differs |
| 2168482 Yigit Demir | Eyüpspor | 206315 Yiğit Demir | Eyüpspor | NULL | 27 | D | D | DEF | legacy number missing |
| 1605718 Erdem Çalik | Eyüpspor | 64602 Erdem Çalık | Eyüpspor | NULL | 22 | M | M | MID | legacy number missing |
| 1928568 Diabel Ndoye | Eyüpspor | 13680 Diabel Ndoye | Eyüpspor | 14 | 14 | M | D | DEF | broad position differs |
| 1844328 Christ Sadia | Eyüpspor | 6354 Christ Sadia | Eyüpspor | 84 | 84 | M | F | FWD | broad position differs |
| 889626 Lenny Pintor | Eyüpspor | 8653 Lenny Pintor | Eyüpspor | 11 | 11 | F | M | LW | broad position differs |
| 815981 Konrad Michalak | Eyüpspor | 10852 Konrad Michalak | Eyüpspor | 77 | 77 | F | M | RW | broad position differs |
| 605858 Bilal Boutobba | Eyüpspor | 8101 Bilal Boutobba | Eyüpspor | 98 | 98 | F | M | RW | broad position differs |
| 1448314 Ramazan Özkanli | Kasımpaşa | 65438 Ramazan Özkanli | Kasımpaşa | NULL | 44 | G | G | GK | legacy number missing |
| 178749 Ömer Bayram | Kasımpaşa | 134918 Ömer Bayram | Kasımpaşa | NULL | NULL | D | D | LB | legacy number missing; BSD squad number missing |
| 1540435 Thiemoko Diarra | Kasımpaşa | 37681 Thiemoko Diarra | Kasımpaşa | 11 | 11 | F | M | RW | broad position differs |
| 712132 Mortadha Ben Ouanes | Kasımpaşa | 6745 Mortadha Ben Ouanes | Kasımpaşa | 12 | 12 | F | M | LW | broad position differs |
| 1226789 Jesurun Rak-Sakyi | Kasımpaşa | 4949 Jesurun Rak-Sakyi | Kasımpaşa | 17 | 17 | F | M | RW | broad position differs |
| 1505429 Marcus Rafferty | Kasımpaşa | 15990 Marcus Rafferty | Kasımpaşa | 19 | 19 | F | M | CM | broad position differs |
| 2075405 Sercan Deniz | Kasımpaşa | 65436 Sercan Deniz | Kasımpaşa | 35 | 35 | F | M | MID | broad position differs |
| 319827 Kévin Rodrigues | Gençlerbirliği | 6664 Kévin Rodrigues | Gençlerbirliği | NULL | NULL | D | D | LB | legacy number missing; BSD squad number missing |
| 1590209 Arda Akgül | Gençlerbirliği | 36105 Arda Akgül | Gençlerbirliği | NULL | 19 | F | F | FWD | legacy number missing |
| 736098 Peter Etebo | Gençlerbirliği | 7157 Peter Etebo | Gençlerbirliği | 5 | 5 | F | M | DM | broad position differs |
| 511399 Ahmet Oğuz | Konyaspor | 6562 Ahmet Oğuz | Konyaspor | NULL | 2 | D | D | RB | legacy number missing |
| 352023 Deniz Türüc | Konyaspor | 6848 Deniz Türüç | Konyaspor | 9 | 9 | F | M | RW | broad position differs |
| 1527137 Emir Bars | Konyaspor | 64128 Emir Bars | Konyaspor | 45 | 45 | F | M | LW | broad position differs |
| 1300864 Eyüp Aydın | Galatasaray | 5728 Eyüp Aydın | Galatasaray | NULL | 5 | M | M | CM | legacy number missing |
| 1783494 Ada Yüzgeç | Galatasaray | 36099 Ada Yüzgeç | Galatasaray | NULL | 9 | F | F | ST | legacy number missing |
| 530859 Leroy Sané | Galatasaray | 3732 Leroy Sané | Galatasaray | 10 | 10 | F | M | RW | broad position differs |
| 1901084 Can Armando Güner | Galatasaray | 9021 Can Armando Güner | Galatasaray | 27 | 7 | F | F | FWD | number changed |
| 890232 Barış Alper Yılmaz | Galatasaray | 3734 Barış Alper Yılmaz | Galatasaray | 53 | 53 | F | M | LW | broad position differs |
| 1537000 Amara Diouf | Fenerbahçe | 120159 Amara Diouf | Fenerbahçe | NULL | NULL | F | F | FWD | legacy number missing; BSD squad number missing |
| 950473 Mason Greenwood | Fenerbahçe | 1929 Mason Greenwood | Fenerbahçe | 11 | 11 | F | M | RW | broad position differs |
| 1092015 Oğuz Aydın | Fenerbahçe | 3412 Oğuz Aydın | Fenerbahçe | 70 | 70 | F | M | RW | broad position differs |
| 632312 Veysel Sapan | Amedspor | 65693 Veysel Sapan | Amed Sportif Faaliyetler | NULL | 96 | G | G | GK | legacy number missing |
| 1393739 Ali Turap Bülbül | Amedspor | 66183 Ali Turap Bülbül | Amed Sportif Faaliyetler | NULL | 81 | D | D | RB | legacy number missing |
| 2132126 Berat Percin | Amedspor | 65691 Berat Perçin | Amed Sportif Faaliyetler | NULL | 56 | D | D | DEF | legacy number missing |
| 642495 Gökhan Gül | Amedspor | 7952 Gökhan Gül | Amed Sportif Faaliyetler | 18 | 18 | D | M | DM | broad position differs |
| 1698687 Dilhan Demir | Amedspor | 8910 Dilhan Demir | Amed Sportif Faaliyetler | NULL | 21 | F | F | FWD | legacy number missing |
| 2132124 Muhammed Yildirim | Amedspor | 65682 Muhammed Yıldırım | Amed Sportif Faaliyetler | NULL | 19 | F | F | FWD | legacy number missing |
| 1315511 Ermal Krasniqi | Amedspor | 14043 Ermal Krasniqi | Amed Sportif Faaliyetler | 7 | 7 | F | M | MID | broad position differs |
| 1514624 Rayan Lutin | Amedspor | 15636 Rayan Lutin | Amed Sportif Faaliyetler | 93 | 93 | F | M | AM | broad position differs |
| 1609643 Kerem Fidan | Samsunspor | 65987 Kerem Fidan | Samsunspor | NULL | NULL | D | D | DEF | legacy number missing; BSD squad number missing |
| 305679 Emre Kilinç | Samsunspor | 5732 Emre Kılınç | Samsunspor | 11 | 11 | F | M | LW | broad position differs |
| 1072913 Tanguy Coulibaly | Samsunspor | 6981 Tanguy Coulibaly | Samsunspor | 70 | 10 | F | M | RM | number changed; broad position differs |
| 214339 Okay Yokuşlu | Trabzonspor | 6627 Okay Yokuşlu | Trabzonspor | 5 | 5 | D | M | CM | broad position differs |
| 1078729 Batista Mendy | Trabzonspor | 1551 Batista Mendy | Trabzonspor | NULL | 6 | M | M | CM | legacy number missing |
| 1324890 Cihan Çanak | Trabzonspor | 6628 Cihan Çanak | Trabzonspor | NULL | 61 | F | F | RW | legacy number missing |
| 292462 Mohamed Salah | Trabzonspor | 333 Mohamed Salah | Trabzonspor | 10 | 10 | F | M | RW | broad position differs |
| 1793475 Noah Saviolo | Trabzonspor | 2704 Noah Saviolo | Trabzonspor | 70 | 70 | F | M | LW | broad position differs |
| 389181 Metehan Mimaroğlu | Trabzonspor | 6755 Metehan Mimaroğlu | Trabzonspor | 77 | 77 | F | M | LW | broad position differs |

Promotions: 0. BSD detail repeats current provider facts; it does not supply the missing legacy number or an independent common DOB/identity key. A compatible tactical position alone does not prove the cross-provider mapping. We therefore do not silently relax D1 HIGH criteria to make the count larger.

## 7. Ambiguous mappings

| Legacy ID | Team/name | Legacy # / broad / roles | All BSD candidates | Why unresolved |
| --- | --- | --- | --- | --- |
| 1011932 | Çaykur Rizespor / Moussa Diakité | NULL / M /  | 17199 Moussa Diakité (Çaykur Rizespor), #6, M, CM | Two or more legacy claims point to the same BSD identity. Name equality cannot determine duplicate legacy records versus distinct people. No automatic merge. |
| 1415502 | Çaykur Rizespor / Moussa Diakité | 6 / M / MO,ÖL | 17199 Moussa Diakité (Çaykur Rizespor), #6, M, CM | Two or more legacy claims point to the same BSD identity. Name equality cannot determine duplicate legacy records versus distinct people. No automatic merge. |


## 8. Broad-position differences

| Direction | Count |
| --- | --- |
| M → F | 8 |
| F → M | 40 |
| D → F | 1 |
| D → M | 3 |
| M → D | 1 |

| Cause assessment | Count |
| --- | --- |
| LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology | 34 |
| UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable | 8 |
| UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree | 6 |
| PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable | 5 |

| Legacy ID/player | BSD ID | Legacy → BSD broad | BSD specific | Assessment |
| --- | --- | --- | --- | --- |
| 1251666 Ernest Poku | 2144 | M → F | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 660165 Milot Rashica | 5836 | F → M | MID | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 623540 Václav Cerny | 4784 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1642084 İlhan Fakılı | 27113 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1857520 Haydar Karataş | 3425 | M → F | FWD | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 975117 Metehan Altunbaş | 6360 | F → M | ST | UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree |
| 862718 Makana Baku | 11290 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 850311 Rigoberto Rivas | 6571 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 864556 Alexis Antunes | 7729 | M → F | AM | UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree |
| 678812 Efkan Bekiroğlu | 5714 | M → F | AM | UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree |
| 619513 Eldor Shomurodov | 6643 | M → F | FWD | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 863858 Yusuf Sarı | 6901 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 199302 Edin Višća | 6849 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 861932 Andreas Skov Olsen | 1384 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 890266 Valentin Mihăilă | 6740 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 887139 Ahmed Kutucu | 3739 | F → M | ST | UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree |
| 673749 Miguel Cardoso | 6510 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1804781 Mustafa Fettahoğlu | 27403 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 603477 Cengiz Ünder | 6784 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1183141 Göktan Gürpüz | 6753 | F → M | AM | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 962786 Fuat Bavuk | 65844 | D → F | FWD | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 1717397 Karamba Gassama | 8569 | F → M | CM | PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable |
| 1269943 Enver Kulašin | 6676 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1364337 Şahin Dik | 104616 | D → M | LB | UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree |
| 1300869 İbrahim Kaya | 6727 | M → F | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 645107 Ianis Hagi | 5797 | M → F | AM | UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree |
| 1111753 Emre Demir | 66906 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1928568 Diabel Ndoye | 13680 | M → D | DEF | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 1844328 Christ Sadia | 6354 | M → F | FWD | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 889626 Lenny Pintor | 8653 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 815981 Konrad Michalak | 10852 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 605858 Bilal Boutobba | 8101 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1540435 Thiemoko Diarra | 37681 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 712132 Mortadha Ben Ouanes | 6745 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1226789 Jesurun Rak-Sakyi | 4949 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1505429 Marcus Rafferty | 15990 | F → M | CM | PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable |
| 2075405 Sercan Deniz | 65436 | F → M | MID | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 736098 Peter Etebo | 7157 | F → M | DM | PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable |
| 352023 Deniz Türüc | 6848 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1527137 Emir Bars | 64128 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 530859 Leroy Sané | 3732 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 890232 Barış Alper Yılmaz | 3734 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 950473 Mason Greenwood | 1929 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1092015 Oğuz Aydın | 3412 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 642495 Gökhan Gül | 7952 | D → M | DM | PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable |
| 1315511 Ermal Krasniqi | 14043 | F → M | MID | UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable |
| 1514624 Rayan Lutin | 15636 | F → M | AM | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 305679 Emre Kilinç | 5732 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1072913 Tanguy Coulibaly | 6981 | F → M | RM | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 214339 Okay Yokuşlu | 6627 | D → M | CM | PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable |
| 292462 Mohamed Salah | 333 | F → M | RW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 1793475 Noah Saviolo | 2704 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |
| 389181 Metehan Mimaroğlu | 6755 | F → M | LW | LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology |

These are diagnostic hypotheses, not evidence of a positional change over time. No historical BSD snapshot was fetched. FotMob is not treated as authoritative; legacy staleness is possible but cannot be separated from different classification policy.

## 9. Shirt-number blockers

| Exact-value class | Count |
| --- | --- |
| NULL | 14 |
| 0 | 0 |
| &gt;99 | 0 |
| non-numeric | 0 |
| other | 0 |

| BSD ID | Team/player | Squad exact value | Detail exact value | Class |
| --- | --- | --- | --- | --- |
| 185437 | Alanyaspor / Bilal Demirağ | NULL | NULL | NULL |
| 92692 | Amed Sportif Faaliyetler / Hüseyin Ülgüt | NULL | NULL | NULL |
| 127578 | Başakşehir FK / Efe Arda Koyuncu | NULL | NULL | NULL |
| 214112 | Beşiktaş JK / Élan Joshep Ricardo Ochoa | NULL | NULL | NULL |
| 185592 | Çaykur Rizespor / Hasan Yağız Döne | NULL | NULL | NULL |
| 65053 | Çorum FK / Atakan Cangöz | NULL | NULL | NULL |
| 144497 | Erzurumspor FK / Kerem Erener | NULL | NULL | NULL |
| 120159 | Fenerbahçe / Amara Diouf | NULL | NULL | NULL |
| 211261 | Gaziantep FK / Kadir Gümüş | NULL | NULL | NULL |
| 6664 | Gençlerbirliği / Kévin Rodrigues | NULL | NULL | NULL |
| 134918 | Kasımpaşa / Ömer Bayram | NULL | NULL | NULL |
| 86698 | Kocaelispor / Talha Polat | NULL | NULL | NULL |
| 65987 | Samsunspor / Kerem Fidan | NULL | NULL | NULL |
| 5740 | Samsunspor / Efe Berat Törüz | NULL | NULL | NULL |

Recommendation: retain nullable shirt_number with 1–99 for known numbers if the observed blockers are all NULL. **All 14 observed cases are NULL in both squad and detail, and are already valid database values. This D1 concern is closed as a schema blocker.** Existing schema already permits NULL; missing numbers alone require no range expansion. If non-NULL blockers exist, quarantine them for an explicit product rule rather than silently coercing them.

Separate matched-player number differences:

| Legacy player/team | BSD ID/player/team | Legacy # | BSD # |
| --- | --- | --- | --- |
| Edin Višća / Başakşehir | 6849 Edin Višća / Başakşehir FK | 34 | 7 |
| Habil Özbakir / Çaykur Rizespor | 65745 Habil Özbakir / Çaykur Rizespor | 95 | 21 |
| Can Armando Güner / Galatasaray | 9021 Can Armando Güner / Galatasaray | 27 | 7 |
| Tanguy Coulibaly / Samsunspor | 6981 Tanguy Coulibaly / Samsunspor | 70 | 10 |


## 10. Team short names

| Team | BSD short_name | Unicode length | Current product short label |
| --- | --- | --- | --- |
| Alanyaspor | Alanyaspor | 10 | ALA |
| Başakşehir FK | Başakşehir | 10 | İBF |
| Erzurumspor FK | Erzurumspor | 11 | ERZ |
| Fenerbahçe | Fenerbahçe | 10 | FB |
| Galatasaray | Galatasaray | 11 | GS |
| Gaziantep FK | Gaziantep | 9 | GFK |
| Gençlerbirliği | Gençlerbirliği | 14 | GEN |
| Kasımpaşa | Kasımpaşa | 9 | KAS |
| Kocaelispor | Kocaelispor | 11 | KOC |
| Konyaspor | Konyaspor | 9 | KON |
| Samsunspor | Samsunspor | 10 | SAM |
| Trabzonspor | Trabzonspor | 11 | TS |

Recommendation: preserve product-owned UI abbreviations (GS, FB, BJK, TS, etc.) independently of provider short_name. Do not copy long provider labels into the <=8-character UI field; optional provider metadata can retain them later. No schema expansion is needed to display the current badges.

## 11. Team colors as product UI metadata

The palette may remain independent product UI metadata. This is an architectural ownership decision, not a claim that the hex codes were originally invented internally or sourced from any particular website. Their external provenance remains unknown. All 18 live detail responses were read; no color field was exposed.

| Location | Use |
| --- | --- |
| dist/app.js:21,27,117,154,201,234,301 | Generic jersey SVG, fixed palette, team badges, per-board CSS variables, drag previews and user custom-team colors |
| dist/comparison.js:24; dist/styles.css | Each board owns its palette; CSS consumes --team/--team2 and --c/--c2 |
| src/lib/catalogue.js:2,12; supabase/schema/football.sql:18 | DB color_primary/color_secondary → model color/color2; required hex validation |
| scripts/prepare-seed.mjs:13; supabase/seed.sql | Original palette copying into catalogue seed; no regeneration |
| supabase/functions/matches/teams.js:3,23 | Current provider-team map supplies product colors; separate this metadata from external-ID mapping in future |
| src/lib/match-layout.js:43,68; src/lib/match-board.js:45; src/lib/studio-team-picker.js:18 | Free/Match model carries palette into jerseys and team choices |
| src/lib/matches-ui.js:41; src/lib/match-detail-ui.js:17; dist/matches.css; dist/match-detail.css | Match markers and scoreboard club-primary/secondary styling |
| src/lib/studio-project-snapshot.js:27,39; src/lib/validation.js:12; src/lib/drafts.js; supabase/schema/football.sql:48 | Project/draft/share snapshots retain their own colors; preserve historical/user choices |
| tests/backend.test.mjs; tests/player-jersey.test.mjs; tests/matches-provider.test.mjs | Palette, contrast and mapping regressions; test data, not new provenance |


## 12. Latest completed confirmed XI

| Team | Latest same-season completed event | Kickoff UTC | Status | Starters | Formation | Valid formation | Bench count |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Alanyaspor | 216005 | 2026-09-19T14:00:00.000Z | confirmed | 11 | 3-4-2-1 | yes | 10 |
| Amed Sportif Faaliyetler | 215997 | 2026-09-20T17:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |
| Başakşehir FK | 215998 | 2026-09-19T17:00:00.000Z | confirmed | 11 | 4-4-2 | yes | 10 |
| Beşiktaş JK | 215997 | 2026-09-20T17:00:00.000Z | confirmed | 11 | 4-1-4-1 | yes | 10 |
| Çaykur Rizespor | 216001 | 2026-09-20T17:00:00.000Z | confirmed | 11 | 5-3-2 | yes | 10 |
| Çorum FK | 216005 | 2026-09-19T14:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |
| Erzurumspor FK | 215999 | 2026-09-20T14:00:00.000Z | confirmed | 11 | 5-4-1 | yes | 10 |
| Eyüpspor | 216000 | 2026-09-20T14:00:00.000Z | confirmed | 11 | 4-1-4-1 | yes | 10 |
| Fenerbahçe | 216000 | 2026-09-20T14:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |
| Galatasaray | 216004 | 2026-09-19T17:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |
| Gaziantep FK | 216003 | 2026-09-19T14:00:00.000Z | confirmed | 11 | 4-1-4-1 | yes | 10 |
| Gençlerbirliği | 215998 | 2026-09-19T17:00:00.000Z | confirmed | 11 | 4-1-4-1 | yes | 10 |
| Göztepe | 216001 | 2026-09-20T17:00:00.000Z | confirmed | 11 | 3-4-1-2 | yes | 6 |
| Kasımpaşa | 216002 | 2026-09-18T17:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |
| Kocaelispor | 216003 | 2026-09-19T14:00:00.000Z | confirmed | 11 | 4-3-3 | yes | 10 |
| Konyaspor | 216002 | 2026-09-18T17:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |
| Samsunspor | 215999 | 2026-09-20T14:00:00.000Z | confirmed | 11 | 4-3-3 | yes | 9 |
| Trabzonspor | 216004 | 2026-09-19T17:00:00.000Z | confirmed | 11 | 4-2-3-1 | yes | 10 |

11 valid confirmed starters: **18/18**. Valid formation: **18/18**. Nonempty bench: **18/18**. Only the latest completed same-season event per team was checked, not an older success substituted for the latest. Shared event requests are cached.

Proposed chain: (1) latest completed confirmed XI; (2) deterministic current-squad fallback. Filter transferred/unavailable identities according to explicit product policy, preserve exactly one goalkeeper, fill gaps with broad-role buckets and a stable internal-ID tie-break. Treat historical XI as a starting template, not a prediction. Do not depend on predicted XI, legacy starts/value, or photo presence. No selection_rank implementation changed.

## 13. Identity design inventory

| System/location | Classification | Exact dependency |
| --- | --- | --- |
| scripts/prepare-seed.mjs:12 | DERIVED_REFERENCE | fotmob- + number extracted from source URL |
| dist/rosters.js:1; supabase/seed.sql | HARD_REFERENCE | 539 legacy numeric player IDs and 18 FotMob team references in fixed data |
| src/lib/catalogue.js:27,31 | HARD_REFERENCE | FotMob fallback attribution; generic text ID validation and required position/number/roles contract |
| dist/app.js:72,76,84,88,98 | HARD_REFERENCE | athleteId === catalogue id drives replacement, bench exclusion and overrides; team-name keyed roster lookup |
| dist/comparison.js:24,28 | HARD_REFERENCE | Shared classic board identity; team selects store display name |
| src/lib/match-layout.js:28,39,67 | DERIVED_REFERENCE | URL-derived FotMob team IDs; numeric local-player gate; composite player key embeds side/team/player |
| src/lib/studio-lineups.js:5; src/lib/match-id.js:1 | HARD_REFERENCE | BSD and local lineup player IDs validated as numeric text; UUID player IDs are not a drop-in replacement |
| src/lib/player-overrides.js:3,8; supabase/migrations/20260924094207_player_overrides.sql:5 | SERIALIZED_REFERENCE | local:&lt;legacy-id&gt; and bsd:&lt;external-id&gt; namespaces are stored per owner; semantic namespace switch required |
| src/lib/studio-project-snapshot.js:27,31,46; src/lib/match-board.js | SERIALIZED_REFERENCE | teamId/playerId and composite key/slotKey/personKey across source XI, bench and working state |
| src/lib/drafts.js; src/lib/draft-scope.js; src/lib/validation.js:18 | SERIALIZED_REFERENCE | Per-user draft payload athleteId/team and public shared draft compatibility; storage scope keys are provider-independent |
| src/lib/sharing-ui.js; src/lib/validation.js:39; supabase/schema/football.sql:55 | SERIALIZED_REFERENCE | Readonly shared snapshots preserve athleteId and palette; no live catalogue rewrite required for display |
| supabase/functions/matches/teams.js:4 | HARD_REFERENCE | 18 BSD IDs explicitly map to fotmob-* identities; provider event IDs are a separate domain |
| tests/backend.test.mjs; tests/board-regression.cjs; tests/matches-provider.test.mjs; tests/studio-project-snapshot.test.mjs; tests/player-overrides.test.mjs | TEST_ONLY | Numeric fixtures, old namespaces, seed map equality and restore regressions |


## 14. Future internal identity model — conceptual only

| Concept | Proposed invariant |
| --- | --- |
| teams | Provider-independent internal primary ID; product short label and product palette live here (or separate UI metadata) |
| players | Provider-independent internal primary ID; never equal to BSD ID by design; current team relation explicit |
| team_provider_ids | (provider, external_id) unique → internal team; namespace BSD external team IDs |
| player_provider_ids | (provider, external_id) unique → internal player; no surname/number-based uniqueness |
| legacy_team_aliases | Legacy namespace + fotmob-8637 → internal team T; reversible reviewed compatibility lookup |
| legacy_player_aliases | Legacy namespace + 603669 → internal player P only after reviewed identity evidence; no automatic alias for unresolved cases |

Example: fotmob-8637 resolves to internal T; BSD team 125 also maps to T. For an approved player identity, local:603669 resolves through a legacy alias to internal P, and a separately verified BSD external ID maps to P. Do not equate the numeric strings across providers or bulk-replace local: with bsd:.

Stage a read compatibility resolver before changing write IDs. Existing override row ownership stays unchanged; a future internal-player override key can read legacy aliases, with explicit collision review if local and BSD edits both exist. Never overwrite a user edit simply because an alias now exists.

Saved Studio projects: preserve original snapshot version and display data; remap teamId/playerId plus every key/slotKey/personKey consistently in a versioned in-memory adapter, or retain opaque snapshot keys while resolving separate identity metadata. Bench and working substitutions must stay linked. Do not partially rewrite one ID field.

Drafts: resolve known legacy athleteId on read while retaining user/account scope and unresolved snapshots; write a new version only after the future implementation is approved. Readonly shared lineups should remain self-contained; no retroactive public data rewrite. Preserve old IDs as aliases, do not delete unknown player history.

Before production: approve identity proposals, decide lossy/unknown role policy and XI fallback; implement adapters and targeted restore/override/collision tests; prepare a separate reversible migration. Existing RLS/grants/Auth/sharing security is outside this audit and remains unchanged.

## 15. Request ledger and validation

D1.1 requests: **591**. Failed attempts: **0**. Retried attempts: **0**. Distinct paths cached: **591**. Four workers; globally paced starts (>=180ms); GET only, exact BSD origin, redirects rejected; ceiling 650. Previous D1's 78 calls are not included in this run count. No raw responses persisted, media fetched, Supabase call or web search.

| Endpoint family | Requests | Failed | Retried |
| --- | --- | --- | --- |
| team-list | 1 | 0 | 0 |
| team-detail | 18 | 0 | 0 |
| squad | 18 | 0 | 0 |
| player-detail | 543 | 0 | 0 |
| season-events | 2 | 0 | 0 |
| lineups | 9 | 0 | 0 |

| Failed endpoint | Attempt | HTTP | Failure |
| --- | --- | --- | --- |


Source/D1 artifacts checked unchanged by SHA-256 before report write:

| File | SHA-256 |
| --- | --- |
| dist/rosters.js | 99d3932ee05a6bbaa3e66f2fd8e3ddd038e1eddeffaf19ccad225411c73dd5dd |
| supabase/seed.sql | e83c771e928a7e7de97a1773abce670a067832ae82ecd8d8e5109e8575a779f4 |
| BSD_CATALOGUE_COMPATIBILITY_AUDIT.md | 514833bbf69c51a818e83d2aa9b265504f95249b46576de60c9ec632b501baa5 |
| scripts/audit-bsd-catalogue.mjs | 3e1a72a72ed8c9a849ec7b6258238f5decb7c0f0763b1326f26742563d96cd27 |


## 16. Final decision A–L

Post-crawl semantic review used only the curated in-memory/local audit facts, with **zero extra HTTP calls**. DEF/MID are recognized generic codes; their optional STP/MO defaults are LOSSY proposals, not implemented football facts. Broad-position mismatch causes were assessed conservatively: 34 plausible wing/attacking-midfield taxonomy differences, 8 generic-position unknowns, 6 conflicting BSD field cases and 5 remaining provider classification disagreements. None proves a historical position change.

Local validation completed:

- `node scripts/audit-bsd-migration-blockers.mjs`: successful live crawl, **591 GET requests**, all HTTP 200; 543/543 detail identities verified; no retries.
- `node --check scripts/audit-bsd-migration-blockers.mjs`: passed.
- `node scripts/audit-bsd-migration-blockers.mjs --self-test`: passed; no HTTP calls.
- `git diff --check`: passed; additional untracked-file whitespace checks passed.
- D1 report/script, `dist/rosters.js` and `supabase/seed.sql` SHA-256 checks passed unchanged; their baseline hashes are in section 15.
- New work is limited to `scripts/audit-bsd-migration-blockers.mjs` and this report. The two earlier D1 files remain pre-existing untracked additions. `git diff --stat` is empty for tracked files.
- Configured-token scan of both new files passed. No token or raw provider JSON was written; no photos/logos downloaded.
- No DB/Supabase writes or calls, migration, product source change, ID change, commit, push or deploy. No web search.

Generated `dist/backend.js` contains compiled copies of some audited identity/color paths; it was not rebuilt or edited. Any future product change must update source and regenerate that bundle through the build system.

| Question | Answer |
| --- | --- |
| A — Players with specific_position | 543/543; 0 unverified detail responses |
| B — Values present | CB=85, LW=32, ST=56, AM=24, GK=68, CM=78, LM=2, LB=34, RW=40, MID=22, RB=34, DEF=23, FWD=30, DM=11, RM=4 |
| C — Full detailed-role replacement | All 10 role types exist, but NOT losslessly for every player: 462 direct codes, 81 lossy/default cases, 13 broad/specific conflicts. Single-role fields cannot reproduce multi-role arrays. No legacy-role fill. |
| D — Safe candidates among legacy-only | 29/90; exact published alias or structural token evidence + team/number/position/detail consistency + unique unclaimed target |
| E — Still unresolved | 61/90 below safe threshold (not proven departures); the 2 D1 ambiguous records remain separate |
| F — MEDIUM safely promoted | 0; missing legacy evidence and disagreements were not guessed away |
| G — Invalid shirt-number causes | NULL=14 |
| H — Keep 1–99 range | YES for known numbers; NULL remains allowed. No range migration needed. |
| I — Store BSD short names directly | NO in the UI abbreviation field; retain product short labels. Provider short name may be separate optional metadata. |
| J — Product-owned colors | YES architecturally; preserve palette independently. External hex provenance remains unknown. |
| K — Confirmed XI instead of selection_rank | YES for the observed season; 18/18 latest confirmed XI, 18/18 valid formations, 18/18 benches. Deterministic fallback still required. |
| L — Ready for actual migration | Ready for a migration design/review, NOT an unconditional production apply. Resolve/retain uncertain identities, approve lossy-role policy and implement/test compatibility first. |


## Appendix A. Safe identity proposals (not applied)

| legacyPlayerId | Legacy team/name | BSD ID | BSD name | Evidence |
| --- | --- | --- | --- | --- |
| 1001348 | Beşiktaş / Kartal Yılmaz | 5833 | Kartal Kayra Yılmaz | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1896214 | Beşiktaş / Ahmet Bircan | 8644 | Ahmet Sami Bircan | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 798661 | Kocaelispor / Anfernee Dijksteel | 6576 | Anfernee Jamal Dijksteel | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1093003 | Kocaelispor / Tobias Gulliksen | 16304 | Tobias Fjeld Gulliksen | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1367959 | Göztepe / Mehmet Öztürk | 7025 | Mehmet Şamil Öztürk | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1118178 | Göztepe / Juan | 5715 | Juan Santos da Silva | EXACT_PROVIDER_NAME_OR_PUBLISHED_SHORT_NAME |
| 889745 | Göztepe / Bekir Böke | 86870 | Bekir Turaç Böke | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1211804 | Çaykur Rizespor / Adedire Awokoya Mebude | 7551 | Adedire Mebude | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 2106976 | Çaykur Rizespor / Mustafa Tosun | 86516 | Mustafa Coskun Tosun | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 842682 | Çorum FK / Markus Seehusen Karlsbakk | 50238 | Markus Karlsbakk | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 299358 | Çorum FK / Mame Baba Thiam | 6349 | Mame Thiam | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1766201 | Gaziantep FK / İbrahim Alkış | 7130 | Ibrahim Kagan Alkis | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1762856 | Gaziantep FK / Ali Kalın | 6677 | Ali Osman Kalın | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1662153 | Alanyaspor / Mert Bayram | 5801 | Mert Furkan Bayram | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1398327 | Alanyaspor / Baran Gezek | 6352 | Baran Ali Gezek | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 872726 | Eyüpspor / Mete Kaan Demir | 7097 | Mete Demir | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 820085 | Kasımpaşa / Ali Yanar | 6880 | Ali Emre Yanar | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1437464 | Kasımpaşa / Jakob Vestergaard Jessen | 74284 | Jakob Jessen | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 239626 | Kasımpaşa / Kamil Cörekci | 8610 | Kamil Ahmet Çörekçi | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1197741 | Kasımpaşa / Matei Cristian Ilie | 11634 | Matei Ilie | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1489024 | Kasımpaşa / Taylan Aydın | 5701 | Taylan Utku Aydın | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 997497 | Kasımpaşa / Ali Kol | 5697 | Ali Yavuz Kol | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 707777 | Gençlerbirliği / İrfan Eğribayat | 3422 | İrfan Can Eğribayat | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1794424 | Gençlerbirliği / Arda Çelik | 8624 | Arda Cagan Celik | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1984830 | Gençlerbirliği / Erk Aslan | 52335 | Erk Arda Aslan | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 470399 | Amedspor / David Bates | 7642 | David Robert Bates | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1797560 | Samsunspor / Efe Üstün | 13613 | Efe Yiğit Üstün | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1677467 | Trabzonspor / Ahmet Yıldırım | 6625 | Ahmet Doğan Yıldırım | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |
| 1752855 | Trabzonspor / Erol Çolak | 37416 | Erol Can Çolak | EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION |


## Appendix B. Exhaustive curated player-detail inventory

Only requested audit fields; no raw JSON or media/credential fields.

| BSD ID | Squad team | Squad name | Squad broad | Detail broad | specific_position | Squad # | Detail # |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5787 | Alanyaspor | Nuno Lima | D | D | CB | 3 | 3 |
| 6897 | Alanyaspor | Bedirhan Özyurt | D | D | CB | 4 | 4 |
| 5788 | Alanyaspor | Fidan Aliti | D | D | CB | 5 | 5 |
| 5791 | Alanyaspor | Fatih Aksoy | D | D | CB | 20 | 20 |
| 185437 | Alanyaspor | Bilal Demirağ | D | D | CB | NULL | NULL |
| 6727 | Alanyaspor | Ibrahim Kaya | F | F | LW | 7 | 7 |
| 17268 | Alanyaspor | Omar Ben Ali | F | F | ST | 9 | 9 |
| 5797 | Alanyaspor | Ianis Hagi | F | F | AM | 10 | 10 |
| 6729 | Alanyaspor | Meschak Elia | F | F | ST | 12 | 12 |
| 5796 | Alanyaspor | Hwang Ui-Jo | F | F | ST | 16 | 16 |
| 7052 | Alanyaspor | Arda Usluoğlu | F | F | ST | 17 | 17 |
| 64139 | Alanyaspor | Iván Cédric | F | F | ST | 19 | 19 |
| 5801 | Alanyaspor | Mert Furkan Bayram | G | G | GK | 23 | 23 |
| 5802 | Alanyaspor | Paulo Victor | G | G | GK | 48 | 48 |
| 8851 | Alanyaspor | Mahmut Can Kara | G | G | GK | 99 | 99 |
| 6894 | Alanyaspor | Enes Keskin | M | M | CM | 8 | 8 |
| 5793 | Alanyaspor | Ruan Pereira Duarte | M | M | LM | 11 | 11 |
| 66906 | Alanyaspor | Emre Demir | M | M | LW | 14 | 14 |
| 104616 | Alanyaspor | Şahin Dik | M | M | LB | 17 | 17 |
| 8279 | Alanyaspor | Paolo Fernandes | M | M | RW | 22 | 22 |
| 6895 | Alanyaspor | İzzet Çelik | M | M | CM | 26 | 26 |
| 140341 | Alanyaspor | Arouna Soro | M | M | MID | 32 | 32 |
| 6726 | Alanyaspor | Gaius Makouta | M | M | CM | 42 | 42 |
| 6352 | Alanyaspor | Baran Ali Gezek | M | M | CM | 55 | 55 |
| 6728 | Alanyaspor | Maestro | M | M | CM | 58 | 58 |
| 6902 | Alanyaspor | Yusuf Özdemir | M | M | LB | 88 | 88 |
| 5790 | Alanyaspor | Florent Hadergjonaj | M | M | RB | 94 | 94 |
| 65690 | Amed Sportif Faaliyetler | Miraç Acer | D | D | CB | 3 | 3 |
| 7642 | Amed Sportif Faaliyetler | David Robert Bates | D | D | CB | 4 | 4 |
| 10775 | Amed Sportif Faaliyetler | Lumbardh Dellova | D | D | DEF | 5 | 5 |
| 6357 | Amed Sportif Faaliyetler | Umut Meraş | D | D | LB | 17 | 17 |
| 65685 | Amed Sportif Faaliyetler | Mehmet Yeşil | D | D | CB | 21 | 21 |
| 13679 | Amed Sportif Faaliyetler | Amadou Cissé | D | D | CB | 33 | 33 |
| 65686 | Amed Sportif Faaliyetler | Kahraman Demirtaş | D | D | CB | 47 | 47 |
| 65691 | Amed Sportif Faaliyetler | Berat Perçin | D | D | DEF | 56 | 56 |
| 66183 | Amed Sportif Faaliyetler | Ali Turap Bülbül | D | D | RB | 81 | 81 |
| 6589 | Amed Sportif Faaliyetler | Samuel Ballet | F | F | RW | 10 | 10 |
| 65682 | Amed Sportif Faaliyetler | Muhammed Yıldırım | F | F | FWD | 19 | 19 |
| 8910 | Amed Sportif Faaliyetler | Dilhan Demir | F | F | FWD | 21 | 21 |
| 65678 | Amed Sportif Faaliyetler | Mbaye Diagne | F | F | ST | 45 | 45 |
| 140617 | Amed Sportif Faaliyetler | Mohamed Khalil | F | F | LW | 74 | 74 |
| 65680 | Amed Sportif Faaliyetler | Berk Kızıldemir | F | F | RW | 97 | 97 |
| 2625 | Amed Sportif Faaliyetler | Gift Orban | F | F | ST | 99 | 99 |
| 6673 | Amed Sportif Faaliyetler | Burak Bozan | G | G | GK | 27 | 27 |
| 4199 | Amed Sportif Faaliyetler | Alban Lafont | G | G | GK | 40 | 40 |
| 208569 | Amed Sportif Faaliyetler | Muhammed Damar | G | G | GK | 95 | 95 |
| 65693 | Amed Sportif Faaliyetler | Veysel Sapan | G | G | GK | 96 | 96 |
| 5691 | Amed Sportif Faaliyetler | Cem Üstündag | M | M | CM | 6 | 6 |
| 14043 | Amed Sportif Faaliyetler | Ermal Krasniqi | M | M | MID | 7 | 7 |
| 6506 | Amed Sportif Faaliyetler | Furkan Soyalp | M | M | CM | 8 | 8 |
| 3130 | Amed Sportif Faaliyetler | Yira Collins Sor | M | M | ST | 11 | 11 |
| 7952 | Amed Sportif Faaliyetler | Gökhan Gül | M | M | DM | 18 | 18 |
| 3200 | Amed Sportif Faaliyetler | Rayan Raveloson | M | M | CM | 22 | 22 |
| 56758 | Amed Sportif Faaliyetler | Dia Saba | M | M | AM | 91 | 91 |
| 15636 | Amed Sportif Faaliyetler | Rayan Lutin | M | M | AM | 93 | 93 |
| 92692 | Amed Sportif Faaliyetler | Hüseyin Ülgüt | M | M | MID | NULL | NULL |
| 6638 | Başakşehir FK | Jerome Opoku | D | D | CB | 3 | 3 |
| 6636 | Başakşehir FK | Onur Bulut | D | D | RB | 6 | 6 |
| 6822 | Başakşehir FK | Hamza Güreler | D | D | CB | 15 | 15 |
| 6639 | Başakşehir FK | Christopher Operi | D | D | LB | 21 | 21 |
| 7527 | Başakşehir FK | Emin Bayram | D | D | CB | 23 | 23 |
| 6647 | Başakşehir FK | Ousseynou Ba | D | D | CB | 27 | 27 |
| 41315 | Başakşehir FK | Michał Karbownik | D | D | LB | 33 | 33 |
| 59378 | Başakşehir FK | Saba Kharebashvili | D | D | LB | 38 | 38 |
| 6650 | Başakşehir FK | Ömer Ali Şahiner | D | D | RB | 42 | 42 |
| 127578 | Başakşehir FK | Efe Arda Koyuncu | D | D | CB | NULL | NULL |
| 6644 | Başakşehir FK | Davie Selke | F | F | ST | 9 | 9 |
| 6643 | Başakşehir FK | Eldor Shomurodov | F | F | FWD | 14 | 14 |
| 6350 | Başakşehir FK | Umut Bozok | F | F | ST | 17 | 17 |
| 6646 | Başakşehir FK | Ivan Brnić | F | F | LW | 77 | 77 |
| 95721 | Başakşehir FK | Batuhan Çelik | F | F | ST | 91 | 91 |
| 4786 | Başakşehir FK | Bertuğ Yıldırım | F | F | ST | 91 | 91 |
| 6976 | Başakşehir FK | Volkan Babacan | G | G | GK | 1 | 1 |
| 6635 | Başakşehir FK | Muhammed Şengezer | G | G | GK | 16 | 16 |
| 7039 | Başakşehir FK | Luca Stancic | G | G | GK | 78 | 78 |
| 159830 | Başakşehir FK | Ege Öztürk | G | G | GK | 80 | 80 |
| 7055 | Başakşehir FK | Deniz Dilmen | G | G | GK | 98 | 98 |
| 6648 | Başakşehir FK | Onur Ergün | M | M | CM | 4 | 4 |
| 6849 | Başakşehir FK | Edin Višća | M | M | RW | 7 | 7 |
| 6901 | Başakşehir FK | Yusuf Sarı | M | M | RW | 7 | 7 |
| 6640 | Başakşehir FK | Olivier Kemen | M | M | CM | 8 | 8 |
| 6642 | Başakşehir FK | Abbosbek Fayzullaev | M | M | MID | 11 | 11 |
| 6652 | Başakşehir FK | Jakub Kałuziński | M | M | CM | 18 | 18 |
| 5816 | Başakşehir FK | Berkay Özcan | M | M | CM | 19 | 19 |
| 6641 | Başakşehir FK | Umut Güneş | M | M | CM | 20 | 20 |
| 1384 | Başakşehir FK | Andreas Skov Olsen | M | M | RW | 70 | 70 |
| 2238 | Beşiktaş JK | Kassoum Ouattara | D | D | LB | 11 | 11 |
| 524 | Beşiktaş JK | Emmanuel Agbadou | D | D | CB | 12 | 12 |
| 5829 | Beşiktaş JK | Taylan Bulut | D | D | RB | 22 | 22 |
| 5832 | Beşiktaş JK | Rıdvan Yılmaz | D | D | LB | 33 | 33 |
| 5831 | Beşiktaş JK | Tiago Djaló | D | D | CB | 35 | 35 |
| 5789 | Beşiktaş JK | Ümit Akdağ | D | D | CB | 50 | 50 |
| 5839 | Beşiktaş JK | Emirhan Topçu | D | D | CB | 53 | 53 |
| 7355 | Beşiktaş JK | Yasin Özcan | D | D | CB | 58 | 58 |
| 4082 | Beşiktaş JK | Amir Murillo | D | D | RB | 62 | 62 |
| 59016 | Beşiktaş JK | Mustafa Yortaç | D | D | CB | 63 | 63 |
| 3131 | Beşiktaş JK | Hyeon-gyu Oh | F | F | FWD | 9 | 9 |
| 2144 | Beşiktaş JK | Ernest Poku | F | F | RW | 17 | 17 |
| 3461 | Beşiktaş JK | Leandro Trossard | F | F | LW | 19 | 19 |
| 6883 | Beşiktaş JK | Mustafa Hekimoğlu | F | F | ST | 23 | 23 |
| 6573 | Beşiktaş JK | Can Keleş | F | F | RW | 25 | 25 |
| 2185 | Beşiktaş JK | Dušan Vlahović | F | F | ST | 28 | 28 |
| 65715 | Beşiktaş JK | Ozan Sevim | F | F | FWD | 66 | 66 |
| 8644 | Beşiktaş JK | Ahmet Sami Bircan | F | F | FWD | 70 | 70 |
| 2213 | Beşiktaş JK | Semih Kılıçsoy | F | F | ST | 90 | 90 |
| 1609 | Beşiktaş JK | Alexander Nübel | G | G | GK | 1 | 1 |
| 4787 | Beşiktaş JK | Doğan Alemdar | G | G | GK | 80 | 80 |
| 8643 | Beşiktaş JK | Emir Yaşar | G | G | GK | 96 | 96 |
| 6630 | Beşiktaş JK | Wilfred Ndidi | M | M | CM | 4 | 4 |
| 3916 | Beşiktaş JK | Salih Özcan | M | M | CM | 6 | 6 |
| 5836 | Beşiktaş JK | Milot Rashica | M | M | MID | 7 | 7 |
| 5833 | Beşiktaş JK | Kartal Kayra Yılmaz | M | M | CM | 8 | 8 |
| 5835 | Beşiktaş JK | Orkun Kökçü | M | M | CM | 10 | 10 |
| 6679 | Beşiktaş JK | Junior Olaitan | M | M | AM | 15 | 15 |
| 4784 | Beşiktaş JK | Václav Černý | M | M | RW | 18 | 18 |
| 2188 | Beşiktaş JK | Fabio Miretti | M | M | CM | 21 | 21 |
| 27113 | Beşiktaş JK | İlhan Fakılı | M | M | LW | 29 | 29 |
| 214112 | Beşiktaş JK | Élan Joshep Ricardo Ochoa | M | M | MID | NULL | NULL |
| 5865 | Çaykur Rizespor | Husniddin Aliqulov | D | D | CB | 2 | 2 |
| 5864 | Çaykur Rizespor | Attila Mocsi | D | D | CB | 4 | 4 |
| 6785 | Çaykur Rizespor | Tayyip Talha Sanuç | D | D | CB | 5 | 5 |
| 26628 | Çaykur Rizespor | Zakaria Ariss | D | D | LB | 17 | 17 |
| 159851 | Çaykur Rizespor | Umut Erdem | D | D | LB | 19 | 19 |
| 65745 | Çaykur Rizespor | Habil Özbakir | D | D | DEF | 21 | 21 |
| 26554 | Çaykur Rizespor | Siaka Bakayoko | D | D | CB | 21 | 21 |
| 5859 | Çaykur Rizespor | Taha Şahin | D | D | RB | 37 | 37 |
| 5849 | Çaykur Rizespor | Mithat Pala | D | D | RB | 54 | 54 |
| 5851 | Çaykur Rizespor | Modibo Sagnan | D | D | CB | 93 | 93 |
| 6739 | Çaykur Rizespor | Yakup Ayan | D | D | DEF | 94 | 94 |
| 5856 | Çaykur Rizespor | Ali Sowe | F | F | ST | 9 | 9 |
| 7551 | Çaykur Rizespor | Adedire Mebude | F | F | RW | 11 | 11 |
| 2207 | Çaykur Rizespor | Gennaro Borrelli | F | F | ST | 29 | 29 |
| 11719 | Çaykur Rizespor | Iustin Doicaru | F | F | RW | 79 | 79 |
| 86516 | Çaykur Rizespor | Mustafa Coskun Tosun | F | F | FWD | 80 | 80 |
| 5858 | Çaykur Rizespor | Emrecan Bulut | F | F | LW | 99 | 99 |
| 6660 | Çaykur Rizespor | Zafer Görgen | G | G | GK | 30 | 30 |
| 6899 | Çaykur Rizespor | Efe Doğan | G | G | GK | 35 | 35 |
| 6738 | Çaykur Rizespor | Yahia Fofana | G | G | GK | 75 | 75 |
| 185592 | Çaykur Rizespor | Hasan Yağız Döne | G | G | GK | NULL | NULL |
| 17199 | Çaykur Rizespor | Moussa Diakité | M | M | CM | 6 | 6 |
| 6740 | Çaykur Rizespor | Valentin Mihăilă | M | M | LW | 7 | 7 |
| 6757 | Çaykur Rizespor | Dal Varešanović | M | M | AM | 8 | 8 |
| 5855 | Çaykur Rizespor | Ibrahim Olawoyin | M | M | CM | 10 | 10 |
| 5860 | Çaykur Rizespor | Taylan Antalyalı | M | M | DM | 14 | 14 |
| 5854 | Çaykur Rizespor | Qazim Laci | M | M | CM | 20 | 20 |
| 3739 | Çaykur Rizespor | Ahmed Kutucu | M | M | ST | 23 | 23 |
| 170277 | Çaykur Rizespor | Emirhan Yilmaz | M | M | MID | 47 | 47 |
| 2995 | Çaykur Rizespor | Can Bozdoğan | M | M | CM | 70 | 70 |
| 97934 | Çaykur Rizespor | Muhammed Baltaci | M | M | MID | 96 | 96 |
| 4174 | Çorum FK | Çağlar Söyüncü | D | D | CB | 2 | 2 |
| 6611 | Çorum FK | Serdar Saatçı | D | D | CB | 4 | 4 |
| 5480 | Çorum FK | Alexandre Penetra | D | D | CB | 5 | 5 |
| 6563 | Çorum FK | Hrvoje Smolčić | D | D | CB | 6 | 6 |
| 5841 | Çorum FK | Gökhan Sazdağı | D | D | RB | 11 | 11 |
| 65056 | Çorum FK | Arda Şengül | D | D | CB | 15 | 15 |
| 65057 | Çorum FK | Huseyin Bulut | D | D | RB | 22 | 22 |
| 11738 | Çorum FK | Andrei Borza | D | D | LB | 24 | 24 |
| 65055 | Çorum FK | Cemali Sertel | D | D | LB | 88 | 88 |
| 65042 | Çorum FK | Hasan Ege Akdogan | F | F | ST | 7 | 7 |
| 6349 | Çorum FK | Mame Thiam | F | F | ST | 9 | 9 |
| 3571 | Çorum FK | Youssoufa Moukoko | F | F | ST | 14 | 14 |
| 2041 | Çorum FK | Jesús Ramírez | F | F | ST | 19 | 19 |
| 4992 | Çorum FK | Marcos Felipe | G | G | GK | 1 | 1 |
| 6760 | Çorum FK | Erhan Erentürk | G | G | GK | 18 | 18 |
| 65062 | Çorum FK | Arif Şimşir | G | G | GK | 54 | 54 |
| 6651 | Çorum FK | Berat Özdemir | M | M | DM | 3 | 3 |
| 6784 | Çorum FK | Cengiz Ünder | M | M | RW | 7 | 7 |
| 65048 | Çorum FK | Atakan Akkaynak | M | M | AM | 8 | 8 |
| 50238 | Çorum FK | Markus Karlsbakk | M | M | CM | 8 | 8 |
| 3018 | Çorum FK | Mohammed Diomande | M | M | CM | 10 | 10 |
| 15658 | Çorum FK | Fredy | M | M | AM | 16 | 16 |
| 65046 | Çorum FK | Emircan Gürlük | M | M | LW | 17 | 17 |
| 1813 | Çorum FK | Ylber Ramadani | M | M | CM | 20 | 20 |
| 6753 | Çorum FK | Göktan Gürpüz | M | M | AM | 21 | 21 |
| 53958 | Çorum FK | Ermin Mahmić | M | M | AM | 26 | 26 |
| 6817 | Çorum FK | Ahmed Ildız | M | M | CM | 30 | 30 |
| 185632 | Çorum FK | Furkan Çetinkaya | M | M | MID | 45 | 45 |
| 5771 | Çorum FK | Alexandros Kyziridis | M | M | LW | 89 | 89 |
| 65053 | Çorum FK | Atakan Cangöz | M | M | RB | NULL | NULL |
| 6649 | Erzurumspor FK | Festy Ebosele | D | D | RM | 2 | 2 |
| 27413 | Erzurumspor FK | Yakup Kırtay | D | D | CB | 3 | 3 |
| 27412 | Erzurumspor FK | Amar Gerxhaliu | D | D | CB | 4 | 4 |
| 27411 | Erzurumspor FK | Guram Giorbelidze | D | D | LB | 15 | 15 |
| 6344 | Erzurumspor FK | Nihad Mujakić | D | D | CB | 18 | 18 |
| 27414 | Erzurumspor FK | Mustafa Yumlu | D | D | CB | 22 | 22 |
| 27418 | Erzurumspor FK | Cengizhan Bayrak | D | D | LB | 23 | 23 |
| 27415 | Erzurumspor FK | Ömer Arda Kara | D | D | CB | 25 | 25 |
| 63118 | Erzurumspor FK | Emre Erdem | D | D | DEF | 35 | 35 |
| 65059 | Erzurumspor FK | Taha Rençber | D | D | DEF | 44 | 44 |
| 27416 | Erzurumspor FK | Orhan Ovacıklı | D | D | RB | 53 | 53 |
| 185687 | Erzurumspor FK | Yigit Baran Karaoglan | D | D | DEF | 55 | 55 |
| 7304 | Erzurumspor FK | Gyrano Kerk | F | F | RW | 9 | 9 |
| 27394 | Erzurumspor FK | Eren Tozlu | F | F | ST | 10 | 10 |
| 12185 | Erzurumspor FK | Ibrahim Diabaté | F | F | ST | 19 | 19 |
| 3644 | Erzurumspor FK | Nariman Akhundzade | F | F | ST | 90 | 90 |
| 144497 | Erzurumspor FK | Kerem Erener | F | F | FWD | NULL | NULL |
| 5786 | Erzurumspor FK | Ertuğrul Taşkıran | G | G | GK | 1 | 1 |
| 27425 | Erzurumspor FK | Erkan Anapa | G | G | GK | 17 | 17 |
| 27423 | Erzurumspor FK | Matija Orbanić | G | G | GK | 31 | 31 |
| 35960 | Erzurumspor FK | Şerefhan Sağlık | G | G | GK | 96 | 96 |
| 27401 | Erzurumspor FK | Brandon Baiye | M | M | DM | 6 | 6 |
| 27406 | Erzurumspor FK | Sefa Akgün | M | M | CM | 8 | 8 |
| 6510 | Erzurumspor FK | Miguel Cardoso | M | M | LW | 20 | 20 |
| 210346 | Erzurumspor FK | Emirhan Acar | M | M | CM | 30 | 30 |
| 4009 | Erzurumspor FK | Elisha Owusu | M | M | CM | 42 | 42 |
| 27399 | Erzurumspor FK | Martín Rodríguez | M | M | LW | 65 | 65 |
| 7261 | Erzurumspor FK | Lawrence Agyekum | M | M | CM | 77 | 77 |
| 27403 | Erzurumspor FK | Mustafa Fettahoglu | M | M | LW | 99 | 99 |
| 8652 | Eyüpspor | Arda Yavuz | D | D | DEF | 3 | 3 |
| 7133 | Eyüpspor | Seyfettin Anıl Yaşar | D | D | CB | 4 | 4 |
| 8250 | Eyüpspor | Jawad El Yamiq | D | D | CB | 5 | 5 |
| 6356 | Eyüpspor | Talha Ülvan | D | D | RB | 7 | 7 |
| 13680 | Eyüpspor | Diabel Ndoye | D | D | DEF | 14 | 14 |
| 29278 | Eyüpspor | Simone Giordano | D | D | LB | 21 | 21 |
| 206315 | Eyüpspor | Yiğit Demir | D | D | DEF | 27 | 27 |
| 34178 | Eyüpspor | Zak Jules | D | D | CB | 33 | 33 |
| 8658 | Eyüpspor | Berhan Satli | D | D | DEF | 42 | 42 |
| 10579 | Eyüpspor | Ömer Ahmet Ceyhan | D | D | DEF | 44 | 44 |
| 5696 | Eyüpspor | Yusuf Barası | F | F | ST | 9 | 9 |
| 10580 | Eyüpspor | Abdou Sy | F | F | FWD | 25 | 25 |
| 33687 | Eyüpspor | Ahmed Abdullahi | F | F | ST | 29 | 29 |
| 185694 | Eyüpspor | Musa Karakas | F | F | FWD | 53 | 53 |
| 6354 | Eyüpspor | Christ Sadia | F | F | FWD | 84 | 84 |
| 6909 | Eyüpspor | Emre Bilgin | G | G | GK | 1 | 1 |
| 1980 | Eyüpspor | Horațiu Moldovan | G | G | GK | 31 | 31 |
| 21666 | Eyüpspor | Umut Keseci | G | G | GK | 31 | 31 |
| 22086 | Eyüpspor | David Costa | M | M | AM | 8 | 8 |
| 4337 | Eyüpspor | Abdelhamid Sabiri | M | M | AM | 10 | 10 |
| 8653 | Eyüpspor | Lenny Pintor | M | M | LW | 11 | 11 |
| 8656 | Eyüpspor | Charles-Andre Raux Yao | M | M | CM | 15 | 15 |
| 7058 | Eyüpspor | Hamza Akman | M | M | CM | 18 | 18 |
| 64602 | Eyüpspor | Erdem Çalık | M | M | MID | 22 | 22 |
| 6353 | Eyüpspor | Taşkın Ilter | M | M | CM | 28 | 28 |
| 7097 | Eyüpspor | Mete Demir | M | M | RW | 70 | 70 |
| 10852 | Eyüpspor | Konrad Michalak | M | M | RW | 77 | 77 |
| 55018 | Eyüpspor | Chandrel Massanga | M | M | DM | 88 | 88 |
| 8101 | Eyüpspor | Bilal Boutobba | M | M | RW | 98 | 98 |
| 3410 | Fenerbahçe | Archie Brown | D | D | LB | 3 | 3 |
| 3409 | Fenerbahçe | Yiğit Efe Demir | D | D | CB | 14 | 14 |
| 857 | Fenerbahçe | Nathan Aké | D | D | DEF | 15 | 15 |
| 3420 | Fenerbahçe | Mert Müldür | D | D | RB | 18 | 18 |
| 1487 | Fenerbahçe | Kojo Peprah Oppong | D | D | CB | 21 | 21 |
| 3417 | Fenerbahçe | Levent Mercan | D | D | LB | 22 | 22 |
| 4171 | Fenerbahçe | Jayden Oosterwolde | D | D | CB | 24 | 24 |
| 3407 | Fenerbahçe | Nélson Semedo | D | D | RB | 27 | 27 |
| 3408 | Fenerbahçe | Milan Škriniar | D | D | CB | 37 | 37 |
| 16893 | Fenerbahçe | Ognjen Mimović | D | D | RB | 77 | 77 |
| 3415 | Fenerbahçe | Kerem Aktürkoğlu | F | F | LW | 7 | 7 |
| 8676 | Fenerbahçe | Romelu Lukaku | F | F | ST | 9 | 9 |
| 52334 | Fenerbahçe | Emin Eren Sayar | F | F | RW | 16 | 16 |
| 2647 | Fenerbahçe | Vedat Muriqi | F | F | FWD | 19 | 19 |
| 3418 | Fenerbahçe | Dorgeles Nene | F | F | RW | 45 | 45 |
| 120159 | Fenerbahçe | Amara Diouf | F | F | FWD | NULL | NULL |
| 3421 | Fenerbahçe | Tarık Çetin | G | G | GK | 13 | 13 |
| 3406 | Fenerbahçe | Ederson | G | G | GK | 31 | 31 |
| 5842 | Fenerbahçe | Mert Günok | G | G | GK | 34 | 34 |
| 4172 | Fenerbahçe | İsmail Yüksek | M | M | CM | 5 | 5 |
| 2011 | Fenerbahçe | Mattéo Guendouzi | M | M | CM | 6 | 6 |
| 6812 | Fenerbahçe | Mert Hakan Yandaş | M | M | CM | 8 | 8 |
| 3414 | Fenerbahçe | Marco Asensio | M | M | AM | 10 | 10 |
| 1929 | Fenerbahçe | Mason Greenwood | M | M | RW | 11 | 11 |
| 4577 | Fenerbahçe | İrfan Can Kahveci | M | M | RW | 17 | 17 |
| 6361 | Fenerbahçe | Bartuğ Elmaz | M | M | CM | 28 | 28 |
| 36064 | Fenerbahçe | Abdou Aziz Fall | M | M | MID | 60 | 60 |
| 3412 | Fenerbahçe | Oğuz Aydın | M | M | RW | 70 | 70 |
| 8155 | Fenerbahçe | N'Golo Kanté | M | M | CM | 91 | 91 |
| 4103 | Galatasaray | El Chadaille Bitshiabu | D | D | CB | 3 | 3 |
| 3728 | Galatasaray | Ismail Jakobs | D | D | LB | 4 | 4 |
| 3726 | Galatasaray | Davinson Sánchez | D | D | CB | 6 | 6 |
| 3725 | Galatasaray | Roland Sallai | D | D | RB | 7 | 7 |
| 4217 | Galatasaray | Eren Elmalı | D | D | LB | 17 | 17 |
| 4218 | Galatasaray | Kaan Ayhan | D | D | RB | 23 | 23 |
| 3727 | Galatasaray | Abdülkerim Bardakcı | D | D | CB | 42 | 42 |
| 5681 | Galatasaray | Kazımcan Karataş | D | D | LB | 88 | 88 |
| 4214 | Galatasaray | Wilfried Singo | D | D | CB | 90 | 90 |
| 3735 | Galatasaray | Arda Ünyay | D | D | CB | 91 | 91 |
| 9021 | Galatasaray | Can Armando Güner | F | F | FWD | 7 | 7 |
| 36099 | Galatasaray | Ada Yüzgeç | F | F | ST | 9 | 9 |
| 3449 | Galatasaray | Deniz Gül | F | F | ST | 21 | 21 |
| 1997 | Galatasaray | Rafael Leão | F | F | FWD | 27 | 27 |
| 4216 | Galatasaray | Victor Osimhen | F | F | ST | 45 | 45 |
| 66179 | Galatasaray | Berat Luş | F | F | LW | 73 | 73 |
| 6686 | Galatasaray | Arda Yılmaz | G | G | GK | 1 | 1 |
| 3724 | Galatasaray | Uğurcan Çakır | G | G | GK | 1 | 1 |
| 3737 | Galatasaray | Günay Güvenç | G | G | GK | 19 | 19 |
| 6355 | Galatasaray | Jankat Yılmaz | G | G | GK | 24 | 24 |
| 36100 | Galatasaray | Enes Emre Büyük | G | G | GK | 70 | 70 |
| 5728 | Galatasaray | Eyüp Aydın | M | M | CM | 5 | 5 |
| 3731 | Galatasaray | Gabriel Sara | M | M | CM | 8 | 8 |
| 3732 | Galatasaray | Leroy Sané | M | M | RW | 10 | 10 |
| 4435 | Galatasaray | Yunus Akgün | M | M | RW | 11 | 11 |
| 416 | Galatasaray | Lesley Ugochukwu | M | M | CM | 18 | 18 |
| 3729 | Galatasaray | İlkay Gündoğan | M | M | CM | 20 | 20 |
| 3730 | Galatasaray | Lucas Torreira | M | M | MID | 34 | 34 |
| 3734 | Galatasaray | Barış Alper Yılmaz | M | M | LW | 53 | 53 |
| 2275 | Galatasaray | Renato Nhaga | M | M | CM | 74 | 74 |
| 28316 | Galatasaray | Aleksey Batrakov | M | M | AM | 83 | 83 |
| 4215 | Galatasaray | Mario Lemina | M | M | CM | 99 | 99 |
| 6661 | Gaziantep FK | Luis Pérez | D | D | RB | 2 | 2 |
| 6663 | Gaziantep FK | Arda Kızıldağ | D | D | CB | 4 | 4 |
| 38137 | Gaziantep FK | Efe Sarıkaya | D | D | CB | 5 | 5 |
| 6674 | Gaziantep FK | Myenty Abena | D | D | CB | 14 | 14 |
| 1717 | Gaziantep FK | Abakar Sylla | D | D | CB | 21 | 21 |
| 93847 | Gaziantep FK | Kerim Çalhanoğlu | D | D | LB | 23 | 23 |
| 6898 | Gaziantep FK | Nazım Sangaré | D | D | RB | 30 | 30 |
| 93848 | Gaziantep FK | Sabahattin Destici | D | D | CB | 77 | 77 |
| 28375 | Gaziantep FK | Trivante Stewart | F | F | ST | 9 | 9 |
| 6574 | Gaziantep FK | Serdar Dursun | F | F | ST | 19 | 19 |
| 5631 | Gaziantep FK | Sontje Hansen | F | F | RW | 22 | 22 |
| 5861 | Gaziantep FK | Halil Dervişoğlu | F | F | ST | 28 | 28 |
| 6677 | Gaziantep FK | Ali Osman Kalın | F | F | FWD | 46 | 46 |
| 8571 | Gaziantep FK | Muhammet Akmelek | F | F | FWD | 85 | 85 |
| 65844 | Gaziantep FK | Fuat Bavuk | F | F | FWD | 97 | 97 |
| 211261 | Gaziantep FK | Kadir Gümüş | F | F | FWD | NULL | NULL |
| 12596 | Gaziantep FK | Kacper Tobiasz | G | G | GK | 25 | 25 |
| 7015 | Gaziantep FK | Ataberk Dadakdeniz | G | G | GK | 35 | 35 |
| 13667 | Gaziantep FK | Cemilhan Aslan | G | G | GK | 81 | 81 |
| 7130 | Gaziantep FK | Ibrahim Kagan Alkis | G | G | GK | 95 | 95 |
| 6667 | Gaziantep FK | Drissa Camara | M | M | CM | 3 | 3 |
| 93846 | Gaziantep FK | Ulrich Meleke | M | M | CM | 6 | 6 |
| 6672 | Gaziantep FK | Juninho Bacuna | M | M | CM | 7 | 7 |
| 8570 | Gaziantep FK | Gidado Victor Ntino-Emo | M | M | CM | 8 | 8 |
| 6665 | Gaziantep FK | Kacper Kozłowski | M | M | AM | 10 | 10 |
| 7071 | Gaziantep FK | Mirza Cihan | M | M | LW | 11 | 11 |
| 8569 | Gaziantep FK | Karamba Gassama | M | M | CM | 17 | 17 |
| 6668 | Gaziantep FK | Deian Sorescu | M | M | RM | 18 | 18 |
| 6676 | Gaziantep FK | Enver Kulašin | M | M | RW | 27 | 27 |
| 6786 | Gaziantep FK | Alexandru Maxim | M | M | AM | 44 | 44 |
| 6666 | Gaziantep FK | Ogün Özçiçek | M | M | CM | 61 | 61 |
| 65845 | Gaziantep FK | Burak Enes Yikici | M | M | MID | 85 | 85 |
| 7072 | Gaziantep FK | Muhammet Taha Gunes | M | M | MID | 93 | 93 |
| 6750 | Gençlerbirliği | Thalisson | D | D | CB | 2 | 2 |
| 7011 | Gençlerbirliği | Yiğit Hamza Aydar | D | D | DEF | 3 | 3 |
| 6748 | Gençlerbirliği | Dimitris Goutas | D | D | CB | 6 | 6 |
| 6747 | Gençlerbirliği | Pedro Pereira | D | D | RB | 13 | 13 |
| 64043 | Gençlerbirliği | Berat Can Sebat | D | D | DEF | 22 | 22 |
| 8624 | Gençlerbirliği | Arda Cagan Celik | D | D | DEF | 44 | 44 |
| 74967 | Gençlerbirliği | Ensar Çavuşoğlu | D | D | CB | 53 | 53 |
| 6762 | Gençlerbirliği | Abdurrahim Dursun | D | D | LB | 77 | 77 |
| 6761 | Gençlerbirliği | Fıratcan Üzüm | D | D | RB | 88 | 88 |
| 4220 | Gençlerbirliği | Metehan Baltacı | D | D | CB | 90 | 90 |
| 6664 | Gençlerbirliği | Kévin Rodrigues | D | D | LB | NULL | NULL |
| 1493 | Gençlerbirliği | Tiago Gouveia | F | F | LW | 7 | 7 |
| 39198 | Gençlerbirliği | Pedro Mendes | F | F | ST | 9 | 9 |
| 37795 | Gençlerbirliği | Victor Orakpo | F | F | LW | 12 | 12 |
| 52335 | Gençlerbirliği | Erk Arda Aslan | F | F | FWD | 17 | 17 |
| 36105 | Gençlerbirliği | Arda Akgül | F | F | FWD | 19 | 19 |
| 6752 | Gençlerbirliği | Sekou Koita | F | F | ST | 20 | 20 |
| 8625 | Gençlerbirliği | Prince Martor | F | F | FWD | 45 | 45 |
| 12073 | Gençlerbirliği | Ayaz Özcan | F | F | FWD | 99 | 99 |
| 36110 | Gençlerbirliği | Berk Deniz Çukurcu | G | G | GK | 19 | 19 |
| 6985 | Gençlerbirliği | Gökhan Akkan | G | G | GK | 23 | 23 |
| 3422 | Gençlerbirliği | İrfan Can Eğribayat | G | G | GK | 70 | 70 |
| 7157 | Gençlerbirliği | Peter Etebo | M | M | DM | 5 | 5 |
| 6754 | Gençlerbirliği | Franco Tongya | M | M | AM | 10 | 10 |
| 7057 | Gençlerbirliği | Adama Malouda Traoré | M | M | RW | 14 | 14 |
| 2617 | Gençlerbirliği | Cheikh Niasse | M | M | CM | 19 | 19 |
| 6888 | Gençlerbirliği | Oğulcan Ülgün | M | M | CM | 35 | 35 |
| 10600 | Gençlerbirliği | Ousmane Diabate | M | M | DM | 42 | 42 |
| 5840 | Gençlerbirliği | Salih Uçan | M | M | CM | 48 | 48 |
| 74966 | Gençlerbirliği | Göktug Erdem | M | M | MID | 52 | 52 |
| 1720 | Gençlerbirliği | Rafael Luis | M | M | CM | 83 | 83 |
| 5706 | Göztepe | Allan | D | D | CB | 3 | 3 |
| 5707 | Göztepe | Taha Altıkardeş | D | D | CB | 4 | 4 |
| 54131 | Göztepe | Richard Akonnor | D | D | LB | 12 | 12 |
| 7125 | Göztepe | Ege Yildirim | D | D | CB | 13 | 13 |
| 10671 | Göztepe | Noah Sonko Sundberg | D | D | CB | 19 | 19 |
| 5717 | Göztepe | Furkan Bayır | D | D | CB | 23 | 23 |
| 5709 | Göztepe | Malcom Bokele | D | D | CB | 26 | 26 |
| 617 | Göztepe | André Henrique | F | F | ST | 7 | 7 |
| 5716 | Göztepe | Ibrahim Sabra | F | F | ST | 7 | 7 |
| 7729 | Göztepe | Alexis Antunes | F | F | AM | 8 | 8 |
| 5715 | Göztepe | Juan Santos da Silva | F | F | ST | 9 | 9 |
| 5714 | Göztepe | Efkan Bekiroğlu | F | F | AM | 10 | 10 |
| 86870 | Göztepe | Bekir Turaç Böke | F | F | ST | 14 | 14 |
| 26724 | Göztepe | Gökdeniz Bayrakdar | F | F | RW | 17 | 17 |
| 6310 | Göztepe | Sinclair Armstrong | F | F | ST | 22 | 22 |
| 5055 | Göztepe | Janderson | F | F | ST | 39 | 39 |
| 64050 | Göztepe | Arda Özçimen | G | G | GK | 1 | 1 |
| 6906 | Göztepe | Nevzat Üzel | G | G | GK | 21 | 21 |
| 11300 | Göztepe | Luka Gugeshashvili | G | G | GK | 25 | 25 |
| 7025 | Göztepe | Mehmet Şamil Öztürk | G | G | GK | 33 | 33 |
| 5710 | Göztepe | Arda Kurtulan | M | M | RM | 2 | 2 |
| 5711 | Göztepe | Rhaldney | M | M | CM | 5 | 5 |
| 6084 | Göztepe | Alex Matos | M | M | CM | 6 | 6 |
| 5722 | Göztepe | Ogün Bayrak | M | M | RB | 16 | 16 |
| 1854 | Göztepe | Tino Anjorin | M | M | CM | 18 | 18 |
| 6678 | Göztepe | Novatus Miroshi | M | M | CM | 20 | 20 |
| 5685 | Kasımpaşa | Cláudio Winck | D | D | RB | 2 | 2 |
| 6743 | Kasımpaşa | Adem Arous | D | D | CB | 4 | 4 |
| 74284 | Kasımpaşa | Jakob Jessen | D | D | LB | 5 | 5 |
| 7291 | Kasımpaşa | Kevin Mouanga | D | D | CB | 14 | 14 |
| 5688 | Kasımpaşa | Godfried Frimpong | D | D | LB | 21 | 21 |
| 8610 | Kasımpaşa | Kamil Ahmet Çörekçi | D | D | RB | 22 | 22 |
| 159933 | Kasımpaşa | Salih Arici | D | D | DEF | 24 | 24 |
| 11634 | Kasımpaşa | Matei Ilie | D | D | CB | 27 | 27 |
| 5701 | Kasımpaşa | Taylan Utku Aydın | D | D | CB | 29 | 29 |
| 34297 | Kasımpaşa | Ahmet Taha Dağbaşı | D | D | DEF | 30 | 30 |
| 65437 | Kasımpaşa | Ayberk Karapo | D | D | RB | 45 | 45 |
| 134918 | Kasımpaşa | Ömer Bayram | D | D | LB | NULL | NULL |
| 5697 | Kasımpaşa | Ali Yavuz Kol | F | F | LW | 7 | 7 |
| 2550 | Kasımpaşa | Adrian Benedyczak | F | F | LW | 9 | 9 |
| 97988 | Kasımpaşa | Sinan Alkas | F | F | FWD | 23 | 23 |
| 65433 | Kasımpaşa | Mecit Deniz | F | F | FWD | 35 | 35 |
| 5703 | Kasımpaşa | Emirhan Yiğit | F | F | RW | 42 | 42 |
| 5795 | Kasımpaşa | Güven Yalçın | F | F | ST | 50 | 50 |
| 147993 | Kasımpaşa | Muhammed Bektaş | F | F | FWD | 99 | 99 |
| 65434 | Kasımpaşa | Stann Élysée Dalo | F | F | FWD | 99 | 99 |
| 5684 | Kasımpaşa | Andreas Gianniotis | G | G | GK | 1 | 1 |
| 6880 | Kasımpaşa | Ali Emre Yanar | G | G | GK | 25 | 25 |
| 65438 | Kasımpaşa | Ramazan Özkanli | G | G | GK | 44 | 44 |
| 6903 | Kasımpaşa | Ege Albayrak | G | G | GK | 61 | 61 |
| 5692 | Kasımpaşa | Atakan Mujde | M | M | DM | 8 | 8 |
| 7017 | Kasımpaşa | Haris Hajradinović | M | M | AM | 10 | 10 |
| 37681 | Kasımpaşa | Thiemoko Diarra | M | M | RW | 11 | 11 |
| 6745 | Kasımpaşa | Mortadha Ben Ouanes | M | M | LW | 12 | 12 |
| 6744 | Kasımpaşa | Andri Fannar Baldursson | M | M | CM | 16 | 16 |
| 4949 | Kasımpaşa | Jesurun Rak-Sakyi | M | M | RW | 17 | 17 |
| 15990 | Kasımpaşa | Marcus Rafferty | M | M | CM | 19 | 19 |
| 6346 | Kasımpaşa | Kerem Demirbay | M | M | CM | 26 | 26 |
| 5693 | Kasımpaşa | Fousseni Diabaté | M | M | LW | 34 | 34 |
| 65436 | Kasımpaşa | Sercan Deniz | M | M | MID | 35 | 35 |
| 22080 | Kasımpaşa | Elson Mendes | M | M | CM | 51 | 51 |
| 65435 | Kasımpaşa | Emirhan Boz | M | M | MID | 66 | 66 |
| 6576 | Kocaelispor | Anfernee Jamal Dijksteel | D | D | RB | 2 | 2 |
| 6578 | Kocaelispor | Muharrem Cinan | D | D | LB | 3 | 3 |
| 3196 | Kocaelispor | Tanguy Zoukrou | D | D | CB | 4 | 4 |
| 6343 | Kocaelispor | Emir Ortakaya | D | D | CB | 5 | 5 |
| 27241 | Kocaelispor | Matej Maglica | D | D | CB | 6 | 6 |
| 13528 | Kocaelispor | Deniz Ceylan | D | D | DEF | 16 | 16 |
| 6564 | Kocaelispor | Massadio Haïdara | D | D | LB | 21 | 21 |
| 6881 | Kocaelispor | Uğur Kaan Yıldız | D | D | RB | 22 | 22 |
| 7103 | Kocaelispor | Onur Öztonga | D | D | RB | 41 | 41 |
| 64126 | Kocaelispor | Mikdat Çil | D | D | DEF | 44 | 44 |
| 6567 | Kocaelispor | Dan Agyei | F | F | RW | 7 | 7 |
| 6570 | Kocaelispor | Bruno Petković | F | F | ST | 9 | 9 |
| 13706 | Kocaelispor | Gonçalo Sousa | F | F | RW | 11 | 11 |
| 13618 | Kocaelispor | Arda Ozyar | F | F | FWD | 17 | 17 |
| 3425 | Kocaelispor | Haydar Karataş | F | F | FWD | 19 | 19 |
| 64124 | Kocaelispor | Bedirhan Yıldız | F | F | FWD | 89 | 89 |
| 7609 | Kocaelispor | Florian Ayé | F | F | ST | 97 | 97 |
| 6561 | Kocaelispor | Aleksandar Jovanović | G | G | GK | 1 | 1 |
| 6515 | Kocaelispor | Onurcan Piri | G | G | GK | 23 | 23 |
| 8761 | Kocaelispor | Serhat Öztaşdelen | G | G | GK | 83 | 83 |
| 86698 | Kocaelispor | Talha Polat | G | G | GK | NULL | NULL |
| 16304 | Kocaelispor | Tobias Fjeld Gulliksen | M | M | AM | 8 | 8 |
| 4219 | Kocaelispor | Berkan Kutlu | M | M | CM | 10 | 10 |
| 6658 | Kocaelispor | Show | M | M | CM | 14 | 14 |
| 5945 | Kocaelispor | Mahamadou Susoho | M | M | CM | 20 | 20 |
| 206421 | Kocaelispor | Hulisi Destici | M | M | MID | 26 | 26 |
| 6360 | Kocaelispor | Metehan Altunbaş | M | M | ST | 26 | 26 |
| 6991 | Kocaelispor | Ege Bilim | M | M | MID | 27 | 27 |
| 11290 | Kocaelispor | Makana Baku | M | M | RW | 32 | 32 |
| 6568 | Kocaelispor | Tayfur Bingöl | M | M | AM | 75 | 75 |
| 6571 | Kocaelispor | Rigoberto Rivas | M | M | RW | 99 | 99 |
| 6562 | Konyaspor | Ahmet Oğuz | D | D | RB | 2 | 2 |
| 6623 | Konyaspor | Arif Boşluk | D | D | LB | 3 | 3 |
| 6905 | Konyaspor | Adil Demirbağ | D | D | CB | 4 | 4 |
| 6482 | Konyaspor | Uğurcan Yazğılı | D | D | CB | 5 | 5 |
| 1126 | Konyaspor | Chidozie Awaziem | D | D | CB | 15 | 15 |
| 30731 | Konyaspor | Ata Yanık | D | D | CB | 16 | 16 |
| 6481 | Konyaspor | Yhoan Andzouana | D | D | RB | 17 | 17 |
| 6819 | Konyaspor | Rayyan Baniya | D | D | CB | 22 | 22 |
| 3903 | Konyaspor | Arthur Masuaku | D | D | LB | 26 | 26 |
| 66693 | Konyaspor | Da Mata | D | D | CB | 41 | 41 |
| 6486 | Konyaspor | Jackson Muleka | F | F | ST | 11 | 11 |
| 4151 | Konyaspor | Ebrima Colley | F | F | RW | 19 | 19 |
| 1139 | Konyaspor | Mostafa Mohamed | F | F | ST | 42 | 42 |
| 1607 | Konyaspor | Jean-Luc Dompé | F | F | LW | 91 | 91 |
| 6196 | Konyaspor | Enis Destan | F | F | ST | 94 | 94 |
| 6496 | Konyaspor | Deniz Ertaş | G | G | GK | 1 | 1 |
| 6480 | Konyaspor | Bahadır Han Güngördü | G | G | GK | 13 | 13 |
| 7129 | Konyaspor | Egemen Aydin | G | G | GK | 29 | 29 |
| 97937 | Konyaspor | Emir Gündoğdu | G | G | GK | 66 | 66 |
| 9387 | Konyaspor | Diogo Gonçalves | M | M | LW | 7 | 7 |
| 6492 | Konyaspor | Marko Jevtović | M | M | DM | 8 | 8 |
| 6848 | Konyaspor | Deniz Türüç | M | M | RW | 9 | 9 |
| 6488 | Konyaspor | Enis Bardhi | M | M | AM | 10 | 10 |
| 6820 | Konyaspor | Mücahit Ibrahimoglu | M | M | CM | 24 | 24 |
| 36464 | Konyaspor | Omer Cobanoglu | M | M | MID | 25 | 25 |
| 64128 | Konyaspor | Emir Bars | M | M | LW | 45 | 45 |
| 31147 | Konyaspor | Rajmund Tóth | M | M | CM | 66 | 66 |
| 6491 | Konyaspor | Melih İbrahimoğlu | M | M | CM | 77 | 77 |
| 6851 | Samsunspor | Josafat Mendes | D | D | RB | 2 | 2 |
| 13925 | Samsunspor | Igor Drapiński | D | D | CB | 3 | 3 |
| 12260 | Samsunspor | Strahinja Eraković | D | D | DEF | 16 | 16 |
| 5734 | Samsunspor | Logi Tomasson | D | D | LB | 17 | 17 |
| 5737 | Samsunspor | Yunus Emre Çift | D | D | CB | 22 | 22 |
| 8965 | Samsunspor | Enes Albak | D | D | DEF | 23 | 23 |
| 65985 | Samsunspor | Haluk Mustafa Tan | D | D | RB | 29 | 29 |
| 27382 | Samsunspor | Gabriele Guarino | D | D | CB | 34 | 34 |
| 7137 | Samsunspor | Bedirhan Çetin | D | D | CB | 96 | 96 |
| 65987 | Samsunspor | Kerem Fidan | D | D | DEF | NULL | NULL |
| 8627 | Samsunspor | Elayis Tavsan | F | F | RW | 7 | 7 |
| 41509 | Samsunspor | Fatih Kaya | F | F | ST | 14 | 14 |
| 6669 | Samsunspor | Mohamed Bayo | F | F | ST | 18 | 18 |
| 8628 | Samsunspor | Saikuba Jarju | F | F | RW | 30 | 30 |
| 5724 | Samsunspor | Okan Kocuk | G | G | GK | 1 | 1 |
| 13613 | Samsunspor | Efe Yiğit Üstün | G | G | GK | 13 | 13 |
| 6501 | Samsunspor | Bilal Bayazit | G | G | GK | 25 | 25 |
| 5740 | Samsunspor | Efe Berat Törüz | G | G | GK | NULL | NULL |
| 5953 | Samsunspor | Elliot Watt | M | M | CM | 4 | 4 |
| 6891 | Samsunspor | Celil Yüksel | M | M | CM | 5 | 5 |
| 6758 | Samsunspor | Samed Onur | M | M | LW | 8 | 8 |
| 6981 | Samsunspor | Tanguy Coulibaly | M | M | RM | 10 | 10 |
| 5732 | Samsunspor | Emre Kılınç | M | M | LW | 11 | 11 |
| 37209 | Samsunspor | Alper Efe Pazar | M | M | MID | 12 | 12 |
| 12780 | Samsunspor | Oskar Øhlenschlaeger | M | M | CM | 20 | 20 |
| 6348 | Samsunspor | Yalçın Kayan | M | M | DM | 20 | 20 |
| 37210 | Samsunspor | Eyup Degirmenci | M | M | MID | 21 | 21 |
| 38085 | Samsunspor | Antoine Sekongo | M | M | AM | 42 | 42 |
| 8760 | Samsunspor | Jaures Assoumou | M | M | ST | 47 | 47 |
| 6982 | Samsunspor | Afonso Sousa | M | M | AM | 77 | 77 |
| 5850 | Trabzonspor | Samet Akaydın | D | D | CB | 4 | 4 |
| 6620 | Trabzonspor | Stefan Savić | D | D | CB | 15 | 15 |
| 6613 | Trabzonspor | Mustafa Eskihellaç | D | D | LB | 19 | 19 |
| 6789 | Trabzonspor | Wagner Pina | D | D | RB | 20 | 20 |
| 8629 | Trabzonspor | Chibuike Nwaiwu | D | D | CB | 27 | 27 |
| 2519 | Trabzonspor | Cenk Özkaçar | D | D | CB | 39 | 39 |
| 6612 | Trabzonspor | Arseniy Batagov | D | D | CB | 44 | 44 |
| 1235 | Trabzonspor | Sidny Lopes Cabral | D | D | LB | 55 | 55 |
| 3250 | Trabzonspor | Franculino Djú | F | F | ST | 9 | 9 |
| 6490 | Trabzonspor | Umut Nayir | F | F | ST | 14 | 14 |
| 6790 | Trabzonspor | Paul Onuachu | F | F | ST | 30 | 30 |
| 6628 | Trabzonspor | Cihan Çanak | F | F | RW | 61 | 61 |
| 26723 | Trabzonspor | Ali Habeşoğlu | F | F | ST | 99 | 99 |
| 6625 | Trabzonspor | Ahmet Doğan Yıldırım | G | G | GK | 1 | 1 |
| 4827 | Trabzonspor | André Onana | G | G | GK | 24 | 24 |
| 6624 | Trabzonspor | Onuralp Çevikkan | G | G | GK | 25 | 25 |
| 37416 | Trabzonspor | Erol Can Çolak | G | G | GK | 96 | 96 |
| 6627 | Trabzonspor | Okay Yokuşlu | M | M | CM | 5 | 5 |
| 1551 | Trabzonspor | Batista Mendy | M | M | CM | 6 | 6 |
| 8156 | Trabzonspor | Fabinho | M | M | CM | 6 | 6 |
| 6617 | Trabzonspor | Ernest Muçi | M | M | LW | 7 | 7 |
| 6622 | Trabzonspor | Benjamin Bouchouari | M | M | CM | 8 | 8 |
| 333 | Trabzonspor | Mohamed Salah | M | M | RW | 10 | 10 |
| 6610 | Trabzonspor | Ozan Tufan | M | M | CM | 11 | 11 |
| 2593 | Trabzonspor | Ruslan Malinovskyi | M | M | CM | 17 | 17 |
| 6615 | Trabzonspor | Tim Jabol-Folcarelli | M | M | CM | 26 | 26 |
| 6890 | Trabzonspor | Melih Kabasakal | M | M | DM | 57 | 57 |
| 3256 | Trabzonspor | Aral Şimşir | M | M | LM | 58 | 58 |
| 2704 | Trabzonspor | Noah Saviolo | M | M | LW | 70 | 70 |
| 6755 | Trabzonspor | Metehan Mimaroğlu | M | M | LW | 77 | 77 |
