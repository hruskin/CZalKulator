# Chrome Web Store: karta Privacy practices

Podklady pro vyplnění při zveřejnění (anglicky, jak je Web Store chce).

## Single purpose

Sums amounts in a part of a web page that the user selects and converts amounts in foreign currencies to Czech koruna at the daily Czech National Bank rate.

## Permission justifications

- **activeTab**: Reads text in the area the user selects, on the current tab only, after the user clicks the icon, presses the shortcut or uses the context menu.
- **scripting**: Injects the selection and result script into the current tab after activation, and registers the optional "calculate on selection" script when the user turns that mode on.
- **storage**: Caches the Czech National Bank exchange rates and stores whether the optional mode is on.
- **alarms**: Refreshes the cached exchange rates after the Czech National Bank publishes new ones.
- **contextMenus**: Adds "Sečíst a převést na Kč" and "Označit výřez a spočítat (Alt+Shift+S)" to the right-click menu.
- **Host permission https://www.cnb.cz/\***: Downloads the public daily exchange rate list.
- **Optional host permission <all_urls>**: Requested only when the user turns on the optional "calculate on selection" mode in the options, so the extension can show the total right after the user selects text on any site. Selected text is processed locally and never transmitted. Turning the mode off removes the permission.

## Remote code

No, the extension does not use remote code.

## Data usage

No user data is collected or transmitted; selected text is processed only on the user's device. Nothing is checked in the data categories.

## Privacy policy URL

https://github.com/hruskin/Picture-calculator/blob/main/PRIVACY.md
