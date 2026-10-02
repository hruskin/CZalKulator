# CZalculator

Doplněk do Google Chrome: označíte výřez stránky a doplněk v něm najde částky, převede měny jiné než CZK na koruny podle denního kurzu ČNB a sečte je.

## Použití

1. Stiskněte **Alt+Shift+S** (nebo klikněte na ikonu doplňku).
2. Je-li na stránce označený text, spočítá se hned. Jinak tažením myši nakreslete obdélník.
3. U výřezu se objeví bublina se součtem v Kč a rozpisem. Kliknutím zkopírujete součet, Esc ji zavře.

Totéž je i v kontextovém menu (pravé tlačítko): kdekoli na stránce **Označit výřez a spočítat**, nad označeným textem **Sečíst a převést na Kč**.

### Spouštění označením částky (volitelné)

Pravým tlačítkem na ikonu doplňku → **Možnosti** → **Spočítat hned po označení částky myší**. Pak stačí částku označit myší a součet se ukáže sám. Chrome si při zapnutí vyžádá oprávnění ke všem webům; ve výchozím stavu je funkce vypnutá a doplněk žádá jen minimální oprávnění. Spouští se jen na výběr s měnou nebo na sloupec samotných čísel.

## Pravidla

- Částky v jiné měně než CZK (včetně EUR) se převádějí na Kč podle denního kurzu ČNB.
- Více částek se sečte; jsou-li všechny ve stejné měně, ukáže se i součet v ní.
- Čísla bez měny převezmou nejčastější měnu z výřezu; když žádná není, jen se sečtou.
- Data, časy a procenta se ignorují.

## Instalace pro vývoj

1. Otevřete `chrome://extensions` a zapněte **Režim pro vývojáře**.
2. **Načíst rozbalené** a vyberte složku repozitáře.
3. Zkratku lze změnit v `chrome://extensions/shortcuts`.

## Jak to je rychlé

- Text se čte přímo z DOM stránky, bez OCR.
- Kurzy ČNB se drží v `chrome.storage.local` a obnovují se na pozadí (alarm každou hodinu, stahuje se nejvýš jednou za 2 hodiny), takže výpočet na síť nečeká.
- Skript se do stránky vkládá až po aktivaci (`activeTab`), jinak na stránkách nic neběží.

## Soukromí

Doplněk nesbírá ani neodesílá žádná data. Text z výřezu zpracuje jen v prohlížeči a jediné síťové spojení je stažení kurzovního lístku z `www.cnb.cz`. Podrobnosti v [PRIVACY.md](PRIVACY.md).

## Omezení

Nefunguje ve vestavěném prohlížeči PDF, na stránkách `chrome://` a v Chrome Web Store; částky v obrázcích a canvasu nepozná.

## Testy

```
npm test
```
