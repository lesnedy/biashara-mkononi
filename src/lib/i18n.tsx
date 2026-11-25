"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "sw" | "en";

export const DEFAULT_LOCALE: Locale = "sw";
export const SUPPORTED_LOCALES: Locale[] = ["sw", "en"];

const STORAGE_KEY = "biashara-mkononi:language";
const COOKIE_NAME = "bm_language";

const sw = {
  "common.language": "Lugha",

  "brand.name": "Biashara Mkononi",
  "brand.company": "LESNEDY Solution",
  "brand.tagline": "Biashara yako. Udhibiti wako. Popote.",
  "brand.madeForAfrica": "Imetengenezwa kwa biashara za Afrika",
  "brand.simple": "Biashara yako, kwa urahisi.",

  "shell.loading": "Inapakia mazingira ya biashara...",
  "shell.loadErrorTitle": "Imeshindikana kupakia biashara",
  "shell.loadErrorFallback": "Biashara haijapatikana.",
  "shell.retry": "Jaribu tena",
  "shell.signOut": "Toka",
  "shell.signOutTitle": "Toka kwenye akaunti",
  "shell.menuMain": "Menyu kuu",
  "shell.openMenu": "Fungua menyu",
  "shell.closeMenu": "Funga menyu",
  "shell.close": "Funga",
  "shell.role": "Nafasi",
  "shell.defaultUser": "Mtumiaji",

  "nav.dashboard": "Dashibodi",
  "nav.sales": "Mauzo (POS)",
  "nav.products": "Bidhaa",
  "nav.inventory": "Stoo",
  "nav.purchases": "Manunuzi",
  "nav.expenses": "Matumizi",
  "nav.customers": "Wateja",
  "nav.reports": "Ripoti",
  "nav.team": "Timu",

  "role.owner": "Mmiliki",
  "role.admin": "Msimamizi",
  "role.manager": "Meneja",
  "role.cashier": "Mhudumu wa Mauzo",
  "role.storekeeper": "Msimamizi wa Stoo",

  "inviteRole.admin": "Msimamizi (Admin)",
  "inviteRole.manager": "Meneja",
  "inviteRole.cashier": "Mhudumu wa Mauzo",
  "inviteRole.storekeeper": "Msimamizi wa Stoo",

  "pages.dashboard": "Dashibodi",
  "pages.sales": "Mauzo (POS)",
  "pages.products": "Bidhaa",
  "pages.inventory": "Usimamizi wa Stoo",
  "pages.purchases": "Manunuzi na Wasambazaji",
  "pages.expenses": "Matumizi ya Biashara",
  "pages.customers": "Wateja",
  "pages.reports": "Ripoti",
  "pages.team": "Usimamizi wa Timu",

  "login.eyebrow": "USIMAMIZI WA BIASHARA, KWA URAHISI",
  "login.headline1": "Biashara yako.",
  "login.headline2": "Udhibiti wako.",
  "login.headline3": "Popote.",
  "login.description":
    "Simamia mauzo, bidhaa, stoo na fedha zako sehemu moja. Fanya maamuzi bora na kukuza biashara yako kwa uhakika.",
  "login.previewTitle": "MUHTASARI WA BIASHARA",
  "login.welcomeBack": "Karibu tena!",
  "login.previewBadge": "MFANO",
  "login.todaySales": "Mauzo ya leo",
  "login.products": "Bidhaa",
  "login.productsInStock": "Bidhaa kwenye stoo",
  "login.previewValue": "—",
  "login.previewNote": "Mfano wa muonekano, si takwimu halisi",
  "login.salesOverview": "Mauzo yako, kwa muonekano mmoja",
  "login.formEyebrow": "KARIBU TENA",
  "login.formTitle": "Ingia kwenye akaunti yako",
  "login.formDescription":
    "Ingiza taarifa zako ili kuendelea kusimamia biashara yako.",
  "login.email": "Barua pepe",
  "login.password": "Nenosiri",
  "login.forgotPassword": "Umesahau nenosiri?",
  "login.emailPlaceholder": "mfano@biashara.co.tz",
  "login.passwordPlaceholder": "Ingiza nenosiri lako",
  "login.showPassword": "Onyesha nenosiri",
  "login.hidePassword": "Ficha nenosiri",
  "login.signIn": "Ingia kwenye akaunti",
  "login.signingIn": "Inaingia...",
  "login.noAccount": "Huna akaunti bado?",
  "login.createAccount": "Fungua akaunti",
  "login.secureNote": "Taarifa za biashara yako zinalindwa kwa usalama.",
  "login.errorFallback": "Imeshindikana kuingia. Tafadhali jaribu tena.",
  "login.errorWithDetail": "Imeshindikana kuingia: {detail}",

  "demo.privateChip": "DEMO BINAFI",
  "demo.privateTitle": "Anza Demo Binafsi",
  "demo.privateDescription":
    "Kila mgeni anapata biashara ya demo inayojitegemea, yenye data ya mfano iliyotengwa. Hutaona wala kubadilisha taarifa za mgeni mwingine.",
  "demo.privateAccess":
    "Unaanza kama Mmiliki. Unaweza kuchunguza kwa usalama nafasi hizi:",
  "demo.privateCta": "Anza Demo Binafsi",
  "demo.privateUnavailable":
    "Inaandaliwa — huduma ya demo binafsi bado haipatikani.",
  "demo.bannerTitle": "DEMO MODE — Unatumia mazingira ya majaribio",
  "demo.bannerSubtitle": "DEMO MODE — You are exploring a sample business.",
  "demo.badge": "DEMO",
  "demo.bannerRole": "Nafasi ya demo: {role}",
  "demo.bannerBusiness": "Biashara: {business}",
  "demo.resetInfo": "Mmiliki wa demo pekee ndiye anayeweza kurekebisha data.",
  "demo.openSettings": "Mipangilio ya Demo",
  "demo.exit": "Toka kwenye demo",
  "nav.demoSettings": "Mipangilio ya Demo",
  "demo.settingsTitle": "Mipangilio ya Demo",
  "demo.settingsSubtitle":
    "Taarifa za mazingira ya majaribio na usimamizi wa data ya demo.",
  "demo.settings.role": "Nafasi yako kwenye demo",
  "demo.settings.business": "Biashara ya demo",
  "demo.settings.status": "Hali ya data",
  "demo.settings.statusActive": "Inatumika",
  "demo.settings.lastReset": "Mrekebisho wa mwisho",
  "demo.settings.neverReset": "Bado haijarekebishwa",
  "demo.settings.notDemo": "Hii si akaunti ya demo.",
  "demo.settings.resetTitle": "Rekebisha data ya demo",
  "demo.settings.resetDescription":
    "Hatua hii itafuta mabadiliko yote ya majaribio kwenye biashara hii ya demo na kurejesha data ya awali. Akaunti za watumiaji hazitafutwa.",
  "demo.settings.confirmLabel": "Andika RESET ili kuthibitisha",
  "demo.settings.resetButton": "Rekebisha demo sasa",
  "demo.settings.resetting": "Inarekebisha...",
  "demo.settings.success": "Data ya demo imerekebishwa.",
  "demo.settings.error": "Imeshindikana kurekebisha demo: {detail}",
  "demo.settings.temporary":
    "Rekodi za demo ni za majaribio tu. Zinaweza kurekebishwa wakati wowote na haziwakilishi biashara halisi.",
  "demo.settings.ownerOnly":
    "Mmiliki wa demo pekee ndiye anayeweza kurekebisha data.",
  "demo.settings.unavailable":
    "Mfumo wa demo haujasanidiwa kwenye hifadhidata. Msimamizi anahitaji kutekeleza migration na kusambaza akaunti.",

  "register.loadingForm": "Inapakia fomu ya usajili...",
  "register.eyebrow": "ANZA SAFARI YAKO",
  "register.headline": "Biashara yako inastahili",
  "register.headlineAccent": "maendeleo zaidi.",
  "register.description":
    "Jiunge na Biashara Mkononi na uwe na uwezo wa kusimamia mauzo, bidhaa, stoo na taarifa za biashara yako sehemu moja.",
  "register.benefitSecure": "Taarifa zako zinalindwa",
  "register.benefitControl": "Dhibiti biashara yako sehemu moja",
  "register.benefitAfrica": "Imeandaliwa kwa biashara za Afrika",
  "register.formEyebrowNew": "FUNGUA AKAUNTI",
  "register.formEyebrowInvite": "JIUNGE NA TIMU",
  "register.titleNew": "Anza kutumia Biashara Mkononi",
  "register.titleInvite": "Karibu {businessName}",
  "register.descNew": "Jaza taarifa zako hapa chini ili kuunda akaunti yako.",
  "register.descInvite":
    "Kamilisha taarifa zako ili kujiunga na timu ya biashara hii.",
  "register.checkingInvitation": "Inahakiki mwaliko...",
  "register.fullName": "Jina kamili",
  "register.fullNamePlaceholder": "Mfano: Juma Ally",
  "register.businessName": "Jina la biashara",
  "register.businessNamePlaceholder": "Mfano: Juma General Store",
  "register.business": "Biashara",
  "register.phone": "Namba ya simu",
  "register.email": "Barua pepe",
  "register.password": "Nenosiri",
  "register.passwordPlaceholder": "Angalau herufi 8",
  "register.passwordToggle": "Badili mwonekano wa nenosiri",
  "register.confirmPassword": "Thibitisha nenosiri",
  "register.confirmPasswordPlaceholder": "Rudia nenosiri lako",
  "register.submitCreate": "Tengeneza akaunti",
  "register.submitJoin": "Jiunge na biashara",
  "register.submitCreating": "Inatengeneza akaunti...",
  "register.haveAccount": "Tayari una akaunti?",
  "register.signInHere": "Ingia hapa",
  "register.secureNote": "Akaunti yako inalindwa na Supabase Authentication.",
  "register.errorInvalidInvite": "Kiungo cha mwaliko si sahihi.",
  "register.errorInviteNotFound": "Mwaliko si sahihi au muda wake umeisha.",
  "register.errorPasswordLength": "Nenosiri lazima liwe na angalau herufi 8.",
  "register.errorPasswordMismatch": "Nenosiri ulizoingiza hazifanani.",
  "register.errorInviteEmail": "Tumia email ileile iliyo kwenye mwaliko.",
  "register.errorFallback": "Usajili haukufanikiwa. Tafadhali jaribu tena.",
  "register.errorWithDetail": "Usajili haukufanikiwa: {detail}",
  "register.success":
    "Usajili umepokelewa! Angalia barua pepe yako na uthibitishe akaunti. Baada ya uthibitisho, utaendelea kwenye hatua inayofuata.",

  "invite.loading": "Inahakiki mwaliko...",
  "invite.loadingPage": "Inapakia mwaliko...",
  "invite.title": "Mwaliko wa kujiunga na timu",
  "invite.invalidLink":
    "Kiungo hiki si sahihi, kimetumika au muda wake umeisha.",
  "invite.verificationError": "Imeshindikana kuhakiki mwaliko. Jaribu tena.",
  "invite.lede": "Umealikwa kujiunga na biashara ifuatayo:",
  "invite.business": "Biashara",
  "invite.name": "Jina lako",
  "invite.email": "Email iliyoalikwa",
  "invite.role": "Nafasi yako",
  "invite.emailMismatch":
    "Tafadhali ingia kwa akaunti ya {email} ili kukubali mwaliko huu.",
  "invite.acceptError":
    "Imeshindikana kukubali mwaliko. Tafadhali hakikisha mwaliko bado ni halali.",
  "invite.genericError": "Kuna tatizo limetokea. Tafadhali jaribu tena.",
  "invite.signedInAs": "Umeingia kama",
  "invite.belongsTo": "Mwaliko huu ni wa",
  "invite.signInAs": "Ingia kama {email}",
  "invite.createAccount": "Fungua akaunti mpya",
  "invite.accept": "Kubali mwaliko",
  "invite.accepting": "Inakubali mwaliko...",
  "invite.expires": "Mwaliko unaisha:",

  "common.all": "Zote",
  "common.allCategories": "Makundi yote",
  "common.noPermission": "Hauna ruhusa",
  "common.refresh": "Onyesha upya",
  "common.loading": "Inapakia...",
  "common.saving": "Inahifadhi...",
  "common.cancel": "Ghairi",
  "common.adjust": "Rekebisha",
  "common.remove": "Ondoa",
  "common.delete": "Futa",
  "common.fullName": "Jina kamili",
  "common.name": "Jina",
  "common.email": "Barua pepe",
  "common.phone": "Simu",
  "common.address": "Eneo / anwani",
  "common.location": "Eneo",
  "common.notes": "Maelezo",
  "common.date": "Tarehe",
  "common.time": "Muda",
  "common.status": "Hali",
  "common.actions": "Vitendo",
  "common.type": "Aina",
  "common.quantity": "Idadi",
  "common.category": "Kundi",
  "common.product": "Bidhaa",
  "common.products": "Bidhaa",
  "common.customer": "Mteja",
  "common.customers": "Wateja",
  "common.sales": "Mauzo",
  "common.expenses": "Matumizi",
  "common.profit": "Faida",
  "common.receipt": "Risiti",
  "common.total": "Jumla",
  "common.amount": "Kiasi",
  "common.debt": "Deni",
  "common.debtAmount": "Deni: {amount}",
  "common.payment": "Malipo",
  "common.supplier": "Msambazaji",
  "common.value": "Thamani",
  "common.stock": "Stoo",
  "common.inventoryValue": "Thamani ya stoo",
  "common.noSku": "Bila SKU",
  "common.other": "Nyingine",
  "common.walkInCustomer": "Mteja wa haraka",
  "common.optional": "Hiari",
  "common.search": "Tafuta...",
  "common.recordsFound": "{count} rekodi zimepatikana",
  "common.tryAgain": "jaribu tena",

  "status.completed": "Imekamilika",
  "status.cancelled": "Imefutwa",
  "purchaseStatus.paid": "Imelipwa",
  "purchaseStatus.partial": "Sehemu",
  "purchaseStatus.pending": "Haijalipwa",
  "purchaseStatus.cancelled": "Imefutwa",
  "productStatus.active": "Hai",
  "productStatus.archived": "Zilizowekwa kando",
  "productStatus.archivedBadge": "Kando",
  "productStatus.lowStock": "Inaisha",
  "productStatus.available": "Inapatikana",
  "inventoryStatus.low": "Inaisha",
  "inventoryStatus.ok": "Ipo vizuri",
  "customerFilter.withDebt": "Wenye deni",
  "customerFilter.paid": "Waliolipa",
  "reportPeriod.today": "Leo",
  "reportPeriod.week": "Wiki hii",
  "reportPeriod.month": "Mwezi huu",

  "invitation.status.accepted": "Imekubaliwa",
  "invitation.status.revoked": "Imeondolewa",
  "invitation.status.expired": "Imeisha muda",
  "invitation.status.pending": "Inasubiri",

  "paymentMethod.cash": "Cash",
  "paymentMethod.mpesa": "M-Pesa",
  "paymentMethod.tigoPesa": "Tigo Pesa",
  "paymentMethod.airtelMoney": "Airtel Money",
  "paymentMethod.haloPesa": "HaloPesa",
  "paymentMethod.bank": "Benki",

  "category.food": "Vyakula",
  "category.drinks": "Vinywaji",
  "category.cleaning": "Usafi",
  "category.cosmetics": "Vipodozi",
  "category.medicine": "Dawa",
  "category.other": "Nyingine",

  "unit.pieces": "pcs",
  "unit.kg": "kg",
  "unit.g": "g",
  "unit.litre": "lita",
  "unit.ml": "ml",
  "unit.pack": "pakiti",
  "unit.box": "boksi",
  "unit.dozen": "dozen",

  "expenseCategory.shopRent": "Kodi ya Fremu",
  "expenseCategory.electricity": "Umeme",
  "expenseCategory.water": "Maji",
  "expenseCategory.salaries": "Mishahara",
  "expenseCategory.transport": "Usafiri",
  "expenseCategory.communication": "Mawasiliano",
  "expenseCategory.maintenance": "Matengenezo",
  "expenseCategory.food": "Chakula",
  "expenseCategory.taxes": "Ushuru na Kodi",
  "expenseCategory.other": "Mengineyo",

  "inventoryMovement.inOption": "Bidhaa zimeingia",
  "inventoryMovement.outOption": "Bidhaa zimetoka",
  "inventoryMovement.adjustmentOption": "Rekebisha idadi (hesabu)",
  "inventoryMovement.damageOption": "Uharibifu / upotevu",
  "inventoryMovement.in": "Imeingia",
  "inventoryMovement.out": "Imetoka",
  "inventoryMovement.adjustment": "Marekebisho",
  "inventoryMovement.damage": "Uharibifu",
  "inventoryMovement.transfer": "Uhamisho",
  "inventoryMovement.sale": "Mauzo",
  "inventoryMovement.purchase": "Manunuzi",
  "inventoryMovement.refund": "Marejesho",

  "dashboard.warningModulesNotSetup":
    "Baadhi ya moduli hazijasanidiwa kwenye hifadhidata. Msimamizi anahitaji kuendesha migrations.",
  "dashboard.warningStatsLoadFailed":
    "Imeshindikana kupata baadhi ya takwimu: {detail}",
  "dashboard.unavailable":
    "Takwimu za sasa hazipatikani kwa sababu moduli za hifadhidata hazijakamilika. Tafadhali wasiliana na msimamizi.",
  "dashboard.loading": "Inapakia takwimu...",
  "dashboard.todaySales": "Mauzo ya leo",
  "dashboard.todaySalesDetail": "{count} risiti · {amount} zilizolipwa",
  "dashboard.grossProfitToday": "Faida ghafi ya leo",
  "dashboard.grossProfitHint": "Mauzo – gharama ya bidhaa",
  "dashboard.expensesToday": "Matumizi ya leo",
  "dashboard.netProfit": "Faida halisi: {amount}",
  "dashboard.inventoryDetail": "{products} bidhaa · {units} vipande",
  "dashboard.salesTrend": "Mwenendo wa mauzo",
  "dashboard.lastSevenDays": "Siku saba zilizopita",
  "dashboard.thisWeek": "Wiki hii",
  "dashboard.weekTotal": "Jumla ya wiki: {amount}",
  "dashboard.creditSalesToday": "Mauzo ya mkopo leo: {amount}",
  "dashboard.customerDebt": "Deni la wateja: {amount}",
  "dashboard.lowStock": "Bidhaa zinaisha",
  "dashboard.lowStockHint": "Zinahitaji kuongezwa stoo",
  "dashboard.lowStockEmpty": "Stoo yote iko katika kiwango kizuri.",
  "dashboard.buyLink": "Nunua",
  "dashboard.recentSales": "Mauzo ya hivi karibuni",
  "dashboard.recentSalesHint": "Risiti za mwisho zilizorekodiwa",
  "dashboard.viewAll": "Tazama yote",
  "dashboard.noSalesYet": "Hakuna mauzo bado.",
  "dashboard.recordFirstSale": "Rekodi mauzo ya kwanza.",
  "dashboard.bestSellers": "Bidhaa zinazouzwa zaidi",
  "dashboard.last7Days": "Siku 7 zilizopita",
  "dashboard.noSalesDataYet": "Hakuna data ya mauzo bado.",
  "dashboard.units": "{count} vipande",

  "sales.setupHint":
    "Moduli hii inahitaji kukamilisha usanidi wa hifadhidata (migrations) kabla ya kutumika.",
  "sales.errorLoadProducts": "Imeshindikana kupata bidhaa: {detail}",
  "sales.errorOutOfStock": "\"{product}\" haina stoo.",
  "sales.errorInsufficientStock": "Stoo ya \"{product}\" haitoshi.",
  "sales.errorEmptyCart": "Ongeza bidhaa kwenye kikapu kwanza.",
  "sales.errorInsufficientPayment":
    "Kiasi alicholipa mteja hakitoshi. Chagua mteja kwa mauzo ya mkopo.",
  "sales.errorRpcInsufficientStock":
    "Stoo haitoshi kwa bidhaa iliyochaguliwa. Angalia wingi kisha jaribu tena.",
  "sales.errorPaymentShort": "Kiasi kilicholipwa hakitoshi.",
  "sales.errorNoPermissionComplete": "Hauna ruhusa ya kufanya mauzo.",
  "sales.errorProductNotFound": "Bidhaa haipo kwenye biashara hii.",
  "sales.errorCompleteFailed":
    "Imeshindikana kukamilisha mauzo. Jaribu tena.",
  "sales.errorNoPermissionCancel": "Hauna ruhusa ya kufuta mauzo.",
  "sales.cancelReasonPrompt": "Sababu ya kufuta risiti {receipt}:",
  "sales.errorCancelFailed": "Imeshindikana kufuta mauzo: {detail}",
  "sales.noticeCancelled":
    "Risiti {receipt} imefutwa na stoo imerudishwa.",
  "sales.itemsCount": "{count} bidhaa",
  "sales.selectProducts": "Chagua bidhaa",
  "sales.searchPlaceholder": "Tafuta bidhaa au SKU...",
  "sales.loading": "Inapakia bidhaa...",
  "sales.noProductsFound":
    "Hakuna bidhaa iliyopatikana. Ongeza bidhaa kwenye ukurasa wa Bidhaa.",
  "sales.inCart": "Kikapu: {count}",
  "sales.stockLabel": "Stoo: {qty} {unit}",
  "sales.recentSales": "Mauzo ya hivi karibuni",
  "sales.recentSalesHint": "Rekodi za mauzo zilizohifadhiwa.",
  "sales.noSalesRecorded": "Hakuna mauzo yaliyorekodiwa bado.",
  "sales.cancelSale": "Futa mauzo",
  "sales.cartTitle": "Kikapu cha mauzo",
  "sales.itemsSelected": "{count} bidhaa zimechaguliwa",
  "sales.cartEmpty": "Kikapu kiko tupu",
  "sales.cartEmptyHint": "Chagua bidhaa ili kuanza mauzo.",
  "sales.subtotal": "Jumla ndogo",
  "sales.discount": "Punguzo (TSh)",
  "sales.paymentMethod": "Njia ya malipo",
  "sales.paidByCustomer": "Kiasi alicholipa mteja",
  "sales.customerOptional": "Mteja (hiari, kwa mauzo ya mkopo)",
  "sales.creditNotice":
    "Mauzo ya mkopo: deni la {amount} litaongezwa kwa mteja.",
  "sales.completing": "Inakamilisha...",
  "sales.completeSale": "Kamilisha mauzo",
  "sales.receiptTitle": "Risiti ya mauzo",
  "sales.receiptSubtitle": "Risiti ya mauzo · Biashara Mkononi",
  "sales.receiptNumberLabel": "Namba: ",
  "sales.receiptPaymentLabel": "Malipo: ",
  "sales.receiptPaid": "Alicholipa",
  "sales.receiptThanks": "Asante kwa kufanya biashara nasi!",
  "sales.change": "Chenji",
  "sales.print": "Chapisha",

  "products.setupHint":
    "Moduli ya bidhaa haijasanidiwa kikamilifu. Msimamizi anahitaji kuendesha migrations.",
  "products.errorLoad": "Imeshindikana kupata bidhaa: {detail}",
  "products.errorNoBusiness": "Biashara haijapatikana. Tafadhali ingia tena.",
  "products.errorNameRequired": "Weka jina la bidhaa.",
  "products.errorInvalidPrices": "Bei za bidhaa lazima ziwe namba sahihi.",
  "products.errorNegativeStock": "Idadi ya stoo haiwezi kuwa hasi.",
  "products.errorUpdate": "Imeshindikana kuhifadhi: {detail}",
  "products.noticeUpdated": "Bidhaa imehifadhiwa.",
  "products.errorInsert": "Imeshindikana kuhifadhi bidhaa: {detail}",
  "products.errorInsertFallback":
    "Imeshindikana kuhifadhi bidhaa. Tafadhali jaribu tena.",
  "products.errorOpeningStock":
    "Bidhaa imehifadhiwa, lakini stoo ya kuanzia haijarekodiwa: {detail}",
  "products.noticeCreated": "Bidhaa imesajiliwa.",
  "products.errorArchive": "Imeshindikana kubadilisha hali: {detail}",
  "products.noticeRestored": "\"{product}\" imerejeshwa kwenye mauzo.",
  "products.noticeArchived":
    "\"{product}\" imewekwa kando na haitaonekana kwenye mauzo.",
  "products.confirmDelete":
    "Futa kabisa \"{product}\"? Hatua hii haiwezi kurudishwa.",
  "products.errorDelete":
    "Imeshindikana kufuta bidhaa. Ikiwa bidhaa ilishatumika kwenye mauzo, iweke kando badala yake. ({detail})",
  "products.noticeDeleted": "Bidhaa imefutwa.",
  "products.addProduct": "Ongeza bidhaa",
  "products.activeProducts": "Bidhaa hai",
  "products.lowStock": "Zinaisha",
  "products.totalUnits": "Jumla ya vipande",
  "products.editProduct": "Hariri bidhaa",
  "products.newProduct": "Sajili bidhaa mpya",
  "products.editStockHint":
    "Idadi ya stoo hubadilishwa kupitia ukurasa wa Stoo ili historia ihifadhiwe.",
  "products.newStockHint": "Bidhaa mpya itaingizwa stoo kwa idadi ya kuanzia.",
  "products.fieldName": "Jina la bidhaa",
  "products.namePlaceholder": "Mfano: Sukari Kg 1",
  "products.fieldSku": "SKU",
  "products.fieldBarcode": "Barcode",
  "products.fieldCategory": "Kundi",
  "products.fieldUnit": "Kipimo",
  "products.fieldLowStock": "Kiwango cha chini cha stoo",
  "products.fieldBuyingPrice": "Bei ya kununua (TSh)",
  "products.fieldSellingPrice": "Bei ya kuuza (TSh)",
  "products.fieldCurrentStock": "Idadi iliyopo stoo",
  "products.fieldOpeningStock": "Idadi ya kuanzia",
  "products.saving": "Inahifadhi...",
  "products.saveChanges": "Hifadhi mabadiliko",
  "products.registerProduct": "Sajili bidhaa",
  "products.listTitle": "Orodha ya bidhaa",
  "products.foundCount": "{count} bidhaa zimepatikana",
  "products.searchPlaceholder": "Tafuta jina, SKU, barcode...",
  "products.tableProduct": "Bidhaa",
  "products.tableCategory": "Kundi",
  "products.tableBuying": "Kununua",
  "products.tableSelling": "Kuuza",
  "products.tableProfit": "Faida",
  "products.tableStock": "Stoo",
  "products.loading": "Inapakia bidhaa...",
  "products.noProducts": "Hakuna bidhaa iliyopatikana.",
  "products.editTooltip": "Hariri",
  "products.restoreTooltip": "Rudisha kwenye mauzo",
  "products.archiveTooltip": "Weka kando",
  "products.deleteTooltip": "Futa kabisa",
  "products.archivedNote":
    "Bidhaa zilizowekwa kando hazionekani kwenye POS lakini historia yao inabaki salama.",

  "inventory.errorLoad": "Imeshindikana kupata bidhaa: {detail}",
  "inventory.errorNoPermission": "Hauna ruhusa ya kurekebisha stoo.",
  "inventory.errorSelectProduct": "Chagua bidhaa kwanza.",
  "inventory.errorInvalidQuantity": "Weka kiasi sahihi.",
  "inventory.errorPositiveQuantity":
    "Kiasi lazima kiwe kikubwa kuliko sifuri.",
  "inventory.errorInsufficientStock":
    "Huwezi kutoa bidhaa nyingi kuliko zilizopo stoo.",
  "inventory.errorFallbackSave": "Imeshindikana kuhifadhi: {detail}",
  "inventory.noticeHistoryFallback":
    "Idadi imesasishwa. Historia ya harakati itaanza kuhifadhiwa baada ya migrations kuwekwa.",
  "inventory.errorAdjust": "Imeshindikana kurekebisha stoo: {detail}",
  "inventory.noticeMovementSaved":
    "Stoo ya \"{name}\" imesasishwa: {before} → {after} {unit}.",
  "inventory.stats.products": "Bidhaa",
  "inventory.stats.totalUnits": "Jumla ya vipande",
  "inventory.stats.lowStock": "Zimekaribia kuisha",
  "inventory.stats.stockValue": "Thamani ya stoo",
  "inventory.adjust.title": "Rekebisha stoo",
  "inventory.adjust.description":
    "Kila mabadiliko yanahifadhiwa kwenye historia ya harakati.",
  "inventory.adjust.selectProduct": "-- Chagua bidhaa --",
  "inventory.adjust.productOption": "{name} (stoo: {quantity})",
  "inventory.adjust.movementType": "Aina ya harakati",
  "inventory.adjust.newQuantity": "Idadi mpya",
  "inventory.adjust.notePlaceholder": "Sababu / maelezo",
  "inventory.adjust.currentStock": "Stoo ya sasa ya {name}: {quantity} {unit}",
  "inventory.adjust.exactCountHint":
    " · weka idadi halisi iliyohesabiwa",
  "inventory.adjust.save": "Hifadhi mabadiliko",
  "inventory.list.title": "Orodha ya stoo",
  "inventory.list.found": "{count} bidhaa zimepatikana",
  "inventory.list.onlyLow": "Zinaisha tu",
  "inventory.list.searchPlaceholder": "Tafuta bidhaa...",
  "inventory.list.empty": "Hakuna bidhaa zilizopatikana.",
  "inventory.list.minLevel": "Kiwango cha chini",
  "inventory.list.otherCategory": "Nyingine",
  "inventory.history.title": "Historia ya harakati za stoo",
  "inventory.history.subtitle": "Mabadiliko ya hivi karibuni",
  "inventory.history.empty": "Hakuna historia ya harakati bado.",
  "inventory.history.beforeAfter": "Kabla → Baada",

  "purchases.errorModuleMissing":
    "Moduli ya manunuzi haijasanidiwa kwenye hifadhidata. Msimamizi anahitaji kuendesha migrations.",
  "purchases.errorLoad": "Imeshindikana kupata manunuzi: {detail}",
  "purchases.errorModuleMissingShort":
    "Moduli ya manunuzi haijasanidiwa kwenye hifadhidata.",
  "purchases.errorAddOneItem":
    "Ongeza angalau bidhaa moja kwenye manunuzi.",
  "purchases.errorSave": "Imeshindikana kuhifadhi manunuzi: {detail}",
  "purchases.noticeSaved": "Manunuzi yamehifadhiwa na stoo imeongezwa.",
  "purchases.errorSupplierNameRequired": "Weka jina la msambazaji.",
  "purchases.errorSaveSupplier":
    "Imeshindikana kuhifadhi msambazaji: {detail}",
  "purchases.noticeSupplierAdded": "Msambazaji ameongezwa.",
  "purchases.promptRecordPayment":
    "Deni lililobaki ni {amount}. Weka kiasi kilicholipwa sasa:",
  "purchases.errorInvalidPayment":
    "Weka kiasi sahihi kisichozidi deni lililobaki.",
  "purchases.errorPayment": "Imeshindikana kurekodi malipo: {detail}",
  "purchases.noticePaymentRecorded": "Malipo yamerekodiwa.",
  "purchases.confirmDelete": "Futa rekodi hii ya manunuzi?",
  "purchases.errorDelete":
    "Imeshindikana kufuta manunuzi: {message} (stoo iliyoongezwa haitarejeshwa kiotomatiki)",
  "purchases.noticeDeleted": "Manunuzi yamefutwa.",
  "purchases.actions.addSupplier": "+ Msambazaji",
  "purchases.actions.record": "Rekodi manunuzi",
  "purchases.total": "Jumla ya manunuzi",
  "purchases.stats.paid": "Malipo yaliyofanyika",
  "purchases.stats.supplierDebts": "Madeni ya wasambazaji",
  "purchases.suppliers.title": "Wasambazaji",
  "purchases.suppliers.formTitle": "Sajili msambazaji mpya",
  "purchases.suppliers.location": "Eneo",
  "purchases.suppliers.locationPlaceholder": "Mfano: Dar es Salaam",
  "purchases.suppliers.save": "Hifadhi msambazaji",
  "purchases.suppliers.empty": "Hakuna wasambazaji waliosajiliwa.",
  "purchases.suppliers.noLocation": "Bila eneo",
  "purchases.form.title": "Rekodi manunuzi mapya",
  "purchases.form.description":
    "Bidhaa zilizonunuliwa zitaongezwa kwenye stoo.",
  "purchases.form.noSupplier": "Bila msambazaji",
  "purchases.form.paidAmount": "Kiasi kilicholipwa (TSh)",
  "purchases.form.newItem": "Bidhaa mpya / maelezo",
  "purchases.form.itemPlaceholder": "Jina la bidhaa",
  "purchases.form.unitPrice": "Bei (TSh)",
  "purchases.form.addLine": "Ongeza bidhaa nyingine",
  "purchases.form.save": "Hifadhi manunuzi",
  "purchases.history.title": "Historia ya manunuzi",
  "purchases.history.empty": "Hakuna manunuzi yaliyopatikana.",
  "purchases.reference": "Namba",
  "purchases.actions.view": "Angalia",
  "purchases.actions.recordPayment": "Rekodi malipo",
  "purchases.details.title": "Taarifa za manunuzi",
  "purchases.footer": "Manunuzi yanahifadhiwa na kuongeza stoo kiotomatiki.",

  "expenses.errorModuleMissing":
    "Moduli ya matumizi haijasanidiwa kwenye hifadhidata. Msimamizi anahitaji kuendesha migrations.",
  "expenses.errorLoad": "Imeshindikana kupata matumizi: {detail}",
  "expenses.errorInvalidInput": "Weka jina na kiasi sahihi cha matumizi.",
  "expenses.errorSave": "Imeshindikana kuhifadhi matumizi: {detail}",
  "expenses.noticeSaved": "Matumizi yamehifadhiwa.",
  "expenses.confirmDelete": "Una uhakika unataka kufuta matumizi haya?",
  "expenses.errorDelete": "Imeshindikana kufuta: {detail}",
  "expenses.noticeDeleted": "Matumizi yamefutwa.",
  "expenses.actions.record": "Rekodi matumizi",
  "expenses.stats.total": "Jumla ya matumizi",
  "expenses.stats.thisMonth": "Mwezi huu",
  "expenses.stats.records": "Rekodi",
  "expenses.form.title": "Rekodi matumizi mapya",
  "expenses.form.description": "Jaza taarifa za gharama ya biashara.",
  "expenses.form.titleLabel": "Jina la matumizi",
  "expenses.form.titlePlaceholder": "Mfano: Kodi ya fremu",
  "expenses.form.amount": "Kiasi (TSh)",
  "expenses.form.paymentMethod": "Njia ya malipo",
  "expenses.form.notesPlaceholder": "Maelezo ya ziada...",
  "expenses.form.save": "Hifadhi matumizi",
  "expenses.history.title": "Historia ya matumizi",
  "expenses.history.empty": "Hakuna matumizi yaliyopatikana.",
  "expenses.columns.expense": "Matumizi",
  "expenses.columns.payment": "Malipo",
  "expenses.noNotes": "Hakuna maelezo",
  "expenses.breakdown.title": "Matumizi kwa kundi",
  "expenses.footer": "Matumizi yote yanahifadhiwa kwenye biashara yako.",

  "customers.setupHint":
    "Moduli ya wateja haijasanidiwa kwenye hifadhidata. Msimamizi anahitaji kuendesha migrations.",
  "customers.errorLoad": "Imeshindikana kupata wateja: {detail}",
  "customers.validation.nameRequired": "Weka jina la mteja.",
  "customers.errorSave": "Imeshindikana kuhifadhi mteja: {detail}",
  "customers.noticeUpdated": "Taarifa za mteja zimebadilishwa.",
  "customers.noticeCreated": "Mteja ameongezwa.",
  "customers.confirmDelete":
    "Futa mteja \"{name}\"? Rekodi za mauzo zitabaki bila jina la mteja.",
  "customers.errorDelete": "Imeshindikana kufuta mteja: {detail}",
  "customers.noticeDeleted": "Mteja amefutwa.",
  "customers.validation.invalidAmount": "Weka kiasi sahihi cha malipo.",
  "customers.validation.amountExceedsBalance":
    "Kiasi hiki kinazidi deni la mteja.",
  "customers.errorRecordPayment": "Imeshindikana kurekodi malipo: {detail}",
  "customers.errorStaleBalance":
    "Salio la mteja limebadilika au malipo yamesharekodiwa. Onyesha upya kabla ya kujaribu tena.",
  "customers.noticeFallbackPayment":
    "Salio limepunguzwa. Kumbuka: historia ya malipo itaanza kuhifadhiwa baada ya migrations kuwekwa.",
  "customers.errorAmountExceedsCurrentBalance":
    "Kiasi hiki kinazidi deni la sasa la mteja. Onyesha upya kisha jaribu tena.",
  "customers.errorNotAllowed": "Hauna ruhusa ya kupokea malipo.",
  "customers.errorInvalidPaymentAmount": "Kiasi cha malipo si sahihi.",
  "customers.errorCustomerNotFound": "Mteja haipo kwenye biashara hii.",
  "customers.noticePaymentReceived": "Malipo ya {amount} yamepokelewa.",
  "customers.permission.description":
    "Ukurasa wa wateja unapatikana kwa wafanyakazi wenye ruhusa ya kuhudumia wateja.",
  "customers.add": "Ongeza mteja",
  "customers.stat.total": "Wateja wote",
  "customers.stat.receivable": "Deni la wateja (beki)",
  "customers.form.edit": "Hariri mteja",
  "customers.form.create": "Sajili mteja mpya",
  "customers.form.help":
    "Taarifa hizi hutumika kwenye mauzo ya mkopo na risiti.",
  "customers.form.phone": "Simu",
  "customers.form.phonePlaceholder": "07XXXXXXXX",
  "customers.form.emailPlaceholder": "mteja@example.com",
  "customers.form.address": "Eneo / anwani",
  "customers.form.addressPlaceholder": "Mfano: Kariakoo, Dar es Salaam",
  "customers.form.creditLimit": "Kikomo cha mkopo (TSh)",
  "customers.form.save": "Hifadhi mteja",
  "customers.list.title": "Orodha ya wateja",
  "customers.list.count": "{count} wateja wamepatikana",
  "customers.search.placeholder": "Tafuta jina, simu, email...",
  "customers.filter.withDebt": "Wenye deni",
  "customers.filter.paid": "Waliolipa",
  "customers.empty": "Hakuna wateja waliopatikana.",
  "customers.table.customer": "Mteja",
  "customers.table.contact": "Mawasiliano",
  "customers.table.limit": "Kikomo",
  "customers.table.debt": "Deni",
  "customers.table.joined": "Alijiunga",
  "customers.table.noAddress": "Bila eneo",
  "customers.action.history": "Historia",
  "customers.payment.title": "Pokea malipo",
  "customers.payment.remainingBalance": "Deni lililobaki: ",
  "customers.payment.amount": "Kiasi (TSh)",
  "customers.payment.method": "Njia ya malipo",
  "customers.payment.notePlaceholder": "Hiari",
  "customers.payment.save": "Hifadhi malipo",
  "customers.history.title": "Historia ya {name}",
  "customers.history.subtitle": "Mauzo na malipo ya mteja huyu.",
  "customers.history.payments": "Malipo",
  "customers.history.creditSales": "Mauzo ya mkopo",
  "customers.history.emptySales": "Hakuna mauzo yaliyohusisha mteja huyu.",
  "customers.history.receivedPayments": "Malipo yaliyopokelewa",
  "customers.history.emptyPayments": "Hakuna malipo yaliyorekodiwa.",
  "customers.footer":
    "Wateja na madeni yao yanahifadhiwa kwenye biashara yako.",

  "reports.errorSetup":
    "Moduli za ripoti hazijasanidiwa kwenye hifadhidata. Msimamizi anahitaji kuendesha migrations.",
  "reports.errorLoad": "Imeshindikana kupata takwimu: {detail}",
  "reports.unavailable":
    "Ripoti za sasa hazipatikani kwa sababu moduli za hifadhidata hazijakamilika. Tafadhali wasiliana na msimamizi.",
  "reports.action.print": "Chapisha",
  "reports.permission.description":
    "Ripoti zinapatikana kwa Mmiliki, Msimamizi na Meneja pekee.",
  "reports.loading": "Inaandaa ripoti...",
  "reports.metric.receiptsAverage": "{count} risiti · wastani {amount}",
  "reports.metric.grossProfit": "Faida ghafi",
  "reports.metric.percentOfSales": "{percent}% ya mauzo",
  "reports.metric.operatingCosts": "Gharama za uendeshaji",
  "reports.metric.netProfit": "Faida halisi",
  "reports.metric.grossMinusExpenses": "Faida ghafi – matumizi",
  "reports.metric.cogs": "Gharama ya bidhaa (COGS)",
  "reports.metric.creditSales": "Mauzo ya mkopo",
  "reports.metric.purchases": "Manunuzi / madeni ya wasambazaji",
  "reports.metric.purchaseDebt": "(deni {amount})",
  "reports.chart.title": "Mwenendo wa siku 7",
  "reports.chart.subtitle": "Mauzo dhidi ya matumizi",
  "reports.chart.salesTooltip": "Mauzo: {amount}",
  "reports.chart.expensesTooltip": "Matumizi: {amount}",
  "reports.topProducts.title": "Bidhaa zinazoongoza",
  "reports.topProducts.subtitle": "Kwa mauzo ya kipindi hiki",
  "reports.topProducts.empty": "Hakuna mauzo ya bidhaa kwa kipindi hiki.",
  "reports.table.product": "Bidhaa",
  "reports.table.quantity": "Idadi",
  "reports.table.profit": "Faida",
  "reports.expenseByCategory.title": "Matumizi kwa kundi",
  "reports.expenseByCategory.empty": "Hakuna matumizi kwa kipindi hiki.",
  "reports.paymentMethods.title": "Njia za malipo",
  "reports.paymentMethods.empty": "Hakuna malipo kwa kipindi hiki.",
  "reports.paymentMethods.receipts": "{count} risiti",
  "reports.transactions.title": "Miamala ya kipindi",
  "reports.transactions.records": "{count} rekodi",
  "reports.transactions.empty": "Hakuna miamala kwa kipindi hiki.",
  "reports.table.receipt": "Risiti",
  "reports.table.date": "Tarehe",
  "reports.table.total": "Jumla",
  "reports.table.paid": "Imelipwa",
  "reports.table.debt": "Deni",
  "reports.table.status": "Hali",
  "reports.table.method": "Njia",
  "reports.csv.receipt": "Risiti",
  "reports.csv.date": "Tarehe",
  "reports.csv.total": "Jumla",
  "reports.csv.paid": "Imelipwa",
  "reports.csv.debt": "Deni",
  "reports.csv.status": "Hali",
  "reports.csv.paymentMethod": "Malipo",
  "reports.export.fileName": "ripoti-{period}-{date}.csv",

  "team.errorLoadMembers": "Imeshindikana kupata wanachama: {detail}",
  "team.errorCopyLink": "Imeshindikana kunakili kiungo. Nakili kwa mkono.",
  "team.validation.nameEmailRequired": "Weka jina na email ya mfanyakazi.",
  "team.errorCreate": "Imeshindikana kutengeneza mwaliko.",
  "team.noticeCreated":
    "Mwaliko umetengenezwa. Tuma kiungo kwa mfanyakazi kwa WhatsApp au nakili.",
  "team.errorNetwork": "Kuna tatizo la mtandao. Jaribu tena.",
  "team.confirm.revokeInvitation": "Una uhakika unataka kuondoa mwaliko huu?",
  "team.errorRevoke": "Imeshindikana kuondoa mwaliko: {detail}",
  "team.noticeRevoked": "Mwaliko umeondolewa.",
  "team.errorUpdateRole": "Imeshindikana kubadilisha nafasi: {detail}",
  "team.noticeRoleUpdated": "Nafasi imebadilishwa.",
  "team.confirm.removeMember": "Una uhakika unataka kumuondoa mfanyakazi huyu?",
  "team.errorRemove": "Imeshindikana kumuondoa: {detail}",
  "team.noticeRemoved": "Mfanyakazi ameondolewa.",
  "team.permission.description":
    "Ukurasa huu unapatikana kwa Mmiliki na Msimamizi wa biashara pekee.",
  "team.stat.members": "Wanachama",
  "team.stat.pendingInvitations": "Mialiko inayosubiri",
  "team.stat.owners": "Wamiliki",
  "team.invite.title": "Alika mfanyakazi",
  "team.invite.subtitle": "Tuma kiungo cha usajili kwa email au WhatsApp.",
  "team.invite.fullNamePlaceholder": "Mfano: Asha Mwinyi",
  "team.invite.emailPlaceholder": "mfanyakazi@example.com",
  "team.invite.creating": "Inatengeneza...",
  "team.invite.submit": "Tengeneza mwaliko",
  "team.link.title": "Kiungo cha mwaliko",
  "team.link.shareMessage":
    "Karibu Biashara Mkononi. Bonyeza kiungo hiki kujiunga na timu yetu: {link}",
  "team.link.whatsapp": "Tuma WhatsApp",
  "team.link.copy": "Nakili kiungo",
  "team.link.copied": "Imenakiliwa",
  "team.link.open": "Fungua",
  "team.link.help":
    "Email haitumwi kiotomatiki. Tuma kiungo hiki kwa njia ya WhatsApp au nakili na umtumie mfanyakazi.",
  "team.invitations.title": "Mialiko",
  "team.invitations.subtitle": "Mialiko ya hivi karibuni na hali yake.",
  "team.invitations.empty": "Hakuna mialiko bado.",
  "team.table.employee": "Mfanyakazi",
  "team.table.expires": "Inaisha",
  "team.table.joined": "Alijiunga",
  "team.members.title": "Wanachama wa biashara",
  "team.members.subtitle": "Wafanyakazi waliokwisha kujiunga.",
  "team.members.empty": "Hakuna wanachama waliopatikana.",
} as const;

export type TranslationKey = keyof typeof sw;
export type TranslateFunction = (
  key: TranslationKey,
  variables?: Record<string, string | number>
) => string;

const en: Record<TranslationKey, string> = {
  "common.language": "Language",

  "brand.name": "Biashara Mkononi",
  "brand.company": "LESNEDY Solution",
  "brand.tagline": "Your business. Your control. Anywhere.",
  "brand.madeForAfrica": "Built for African businesses",
  "brand.simple": "Your business, made simple.",

  "shell.loading": "Loading business workspace...",
  "shell.loadErrorTitle": "Could not load business",
  "shell.loadErrorFallback": "Business not found.",
  "shell.retry": "Try again",
  "shell.signOut": "Sign out",
  "shell.signOutTitle": "Sign out of your account",
  "shell.menuMain": "Main menu",
  "shell.openMenu": "Open menu",
  "shell.closeMenu": "Close menu",
  "shell.close": "Close",
  "shell.role": "Role",
  "shell.defaultUser": "User",

  "nav.dashboard": "Dashboard",
  "nav.sales": "Sales (POS)",
  "nav.products": "Products",
  "nav.inventory": "Inventory",
  "nav.purchases": "Purchases",
  "nav.expenses": "Expenses",
  "nav.customers": "Customers",
  "nav.reports": "Reports",
  "nav.team": "Team",

  "role.owner": "Owner",
  "role.admin": "Admin",
  "role.manager": "Manager",
  "role.cashier": "Cashier",
  "role.storekeeper": "Storekeeper",

  "inviteRole.admin": "Admin",
  "inviteRole.manager": "Manager",
  "inviteRole.cashier": "Cashier",
  "inviteRole.storekeeper": "Storekeeper",

  "pages.dashboard": "Dashboard",
  "pages.sales": "Sales (POS)",
  "pages.products": "Products",
  "pages.inventory": "Inventory management",
  "pages.purchases": "Purchases & suppliers",
  "pages.expenses": "Business expenses",
  "pages.customers": "Customers",
  "pages.reports": "Reports",
  "pages.team": "Team management",

  "login.eyebrow": "BUSINESS MANAGEMENT, SIMPLIFIED",
  "login.headline1": "Your business.",
  "login.headline2": "Your control.",
  "login.headline3": "Anywhere.",
  "login.description":
    "Manage sales, products, inventory and finances in one place. Make better decisions and grow your business with confidence.",
  "login.previewTitle": "BUSINESS OVERVIEW",
  "login.welcomeBack": "Welcome back!",
  "login.previewBadge": "ILLUSTRATIVE",
  "login.todaySales": "Today's sales",
  "login.products": "Products",
  "login.productsInStock": "Products in stock",
  "login.previewValue": "—",
  "login.previewNote": "Illustrative preview, not live figures",
  "login.salesOverview": "Your sales, all in one view",
  "login.formEyebrow": "WELCOME BACK",
  "login.formTitle": "Sign in to your account",
  "login.formDescription": "Enter your details to continue managing your business.",
  "login.email": "Email",
  "login.password": "Password",
  "login.forgotPassword": "Forgot password?",
  "login.emailPlaceholder": "example@business.co.tz",
  "login.passwordPlaceholder": "Enter your password",
  "login.showPassword": "Show password",
  "login.hidePassword": "Hide password",
  "login.signIn": "Sign in to your account",
  "login.signingIn": "Signing in...",
  "login.noAccount": "Don't have an account yet?",
  "login.createAccount": "Create an account",
  "login.secureNote": "Your business information is protected.",
  "login.errorFallback": "Could not sign in. Please try again.",
  "login.errorWithDetail": "Could not sign in: {detail}",

  "demo.privateChip": "PRIVATE DEMO",
  "demo.privateTitle": "Start Private Demo",
  "demo.privateDescription":
    "Every visitor gets an independent demo business with isolated sample data. You will never see or change another visitor's information.",
  "demo.privateAccess":
    "You start as Owner and can safely explore these roles:",
  "demo.privateCta": "Start Private Demo",
  "demo.privateUnavailable":
    "Coming soon — private demo provisioning is not available yet.",
  "demo.bannerTitle": "DEMO MODE — You are exploring a sample business.",
  "demo.bannerSubtitle": "DEMO MODE — Unatumia mazingira ya majaribio",
  "demo.badge": "DEMO",
  "demo.bannerRole": "Demo role: {role}",
  "demo.bannerBusiness": "Business: {business}",
  "demo.resetInfo": "Only the demo owner can reset the demo data.",
  "demo.openSettings": "Demo settings",
  "demo.exit": "Exit demo",
  "nav.demoSettings": "Demo settings",
  "demo.settingsTitle": "Demo settings",
  "demo.settingsSubtitle":
    "Information about the sample environment and demo data management.",
  "demo.settings.role": "Your demo role",
  "demo.settings.business": "Demo business",
  "demo.settings.status": "Data status",
  "demo.settings.statusActive": "Active",
  "demo.settings.lastReset": "Last reset",
  "demo.settings.neverReset": "Never reset",
  "demo.settings.notDemo": "This is not a demo account.",
  "demo.settings.resetTitle": "Reset demo data",
  "demo.settings.resetDescription":
    "This removes all trial changes in this demo business and restores the original sample data. User accounts are not deleted.",
  "demo.settings.confirmLabel": "Type RESET to confirm",
  "demo.settings.resetButton": "Reset demo now",
  "demo.settings.resetting": "Resetting...",
  "demo.settings.success": "Demo data has been reset.",
  "demo.settings.error": "Could not reset demo: {detail}",
  "demo.settings.temporary":
    "Demo records are temporary only. They can be reset at any time and do not represent a real business.",
  "demo.settings.ownerOnly": "Only the demo owner can reset the data.",
  "demo.settings.unavailable":
    "The demo system is not configured in the database. An administrator must apply the migration and provision the accounts.",

  "register.loadingForm": "Loading registration form...",
  "register.eyebrow": "START YOUR JOURNEY",
  "register.headline": "Your business deserves",
  "register.headlineAccent": "more progress.",
  "register.description":
    "Join Biashara Mkononi and manage your sales, products, inventory and business records in one place.",
  "register.benefitSecure": "Your data is protected",
  "register.benefitControl": "Run your business from one place",
  "register.benefitAfrica": "Built for African businesses",
  "register.formEyebrowNew": "CREATE AN ACCOUNT",
  "register.formEyebrowInvite": "JOIN THE TEAM",
  "register.titleNew": "Start using Biashara Mkononi",
  "register.titleInvite": "Welcome to {businessName}",
  "register.descNew": "Fill in the details below to create your account.",
  "register.descInvite": "Complete your details to join this business team.",
  "register.checkingInvitation": "Checking invitation...",
  "register.fullName": "Full name",
  "register.fullNamePlaceholder": "Example: Juma Ally",
  "register.businessName": "Business name",
  "register.businessNamePlaceholder": "Example: Juma General Store",
  "register.business": "Business",
  "register.phone": "Phone number",
  "register.email": "Email",
  "register.password": "Password",
  "register.passwordPlaceholder": "At least 8 characters",
  "register.passwordToggle": "Toggle password visibility",
  "register.confirmPassword": "Confirm password",
  "register.confirmPasswordPlaceholder": "Repeat your password",
  "register.submitCreate": "Create account",
  "register.submitJoin": "Join business",
  "register.submitCreating": "Creating account...",
  "register.haveAccount": "Already have an account?",
  "register.signInHere": "Sign in here",
  "register.secureNote": "Your account is protected by Supabase Authentication.",
  "register.errorInvalidInvite": "The invitation link is invalid.",
  "register.errorInviteNotFound": "The invitation is invalid or has expired.",
  "register.errorPasswordLength": "Password must be at least 8 characters.",
  "register.errorPasswordMismatch": "The passwords you entered do not match.",
  "register.errorInviteEmail": "Use the email address from the invitation.",
  "register.errorFallback": "Registration failed. Please try again.",
  "register.errorWithDetail": "Registration failed: {detail}",
  "register.success":
    "Registration received! Check your email and confirm your account. After confirmation, you will continue to the next step.",

  "invite.loading": "Checking invitation...",
  "invite.loadingPage": "Loading invitation...",
  "invite.title": "Team invitation",
  "invite.invalidLink": "This link is invalid, has been used or has expired.",
  "invite.verificationError": "Could not verify the invitation. Please try again.",
  "invite.lede": "You have been invited to join this business:",
  "invite.business": "Business",
  "invite.name": "Your name",
  "invite.email": "Invited email",
  "invite.role": "Your role",
  "invite.emailMismatch":
    "Please sign in with {email} to accept this invitation.",
  "invite.acceptError":
    "Could not accept the invitation. Please make sure it is still valid.",
  "invite.genericError": "Something went wrong. Please try again.",
  "invite.signedInAs": "Signed in as",
  "invite.belongsTo": "This invitation is for",
  "invite.signInAs": "Sign in as {email}",
  "invite.createAccount": "Create a new account",
  "invite.accept": "Accept invitation",
  "invite.accepting": "Accepting invitation...",
  "invite.expires": "Invitation expires:",

  "common.all": "All",
  "common.allCategories": "All categories",
  "common.noPermission": "No permission",
  "common.refresh": "Refresh",
  "common.loading": "Loading...",
  "common.saving": "Saving...",
  "common.cancel": "Cancel",
  "common.adjust": "Adjust",
  "common.remove": "Remove",
  "common.delete": "Delete",
  "common.fullName": "Full name",
  "common.name": "Name",
  "common.email": "Email",
  "common.phone": "Phone",
  "common.address": "Area / address",
  "common.location": "Location",
  "common.notes": "Notes",
  "common.date": "Date",
  "common.time": "Time",
  "common.status": "Status",
  "common.actions": "Actions",
  "common.type": "Type",
  "common.quantity": "Quantity",
  "common.category": "Category",
  "common.product": "Product",
  "common.products": "Products",
  "common.customer": "Customer",
  "common.customers": "Customers",
  "common.sales": "Sales",
  "common.expenses": "Expenses",
  "common.profit": "Profit",
  "common.receipt": "Receipt",
  "common.total": "Total",
  "common.amount": "Amount",
  "common.debt": "Debt",
  "common.debtAmount": "Debt: {amount}",
  "common.payment": "Payment",
  "common.supplier": "Supplier",
  "common.value": "Value",
  "common.stock": "Stock",
  "common.inventoryValue": "Inventory value",
  "common.noSku": "No SKU",
  "common.other": "Other",
  "common.walkInCustomer": "Walk-in customer",
  "common.optional": "Optional",
  "common.search": "Search...",
  "common.recordsFound": "{count} records found",
  "common.tryAgain": "try again",

  "status.completed": "Completed",
  "status.cancelled": "Cancelled",
  "purchaseStatus.paid": "Paid",
  "purchaseStatus.partial": "Partially paid",
  "purchaseStatus.pending": "Unpaid",
  "purchaseStatus.cancelled": "Cancelled",
  "productStatus.active": "Active",
  "productStatus.archived": "Archived",
  "productStatus.archivedBadge": "Archived",
  "productStatus.lowStock": "Low stock",
  "productStatus.available": "Available",
  "inventoryStatus.low": "Low stock",
  "inventoryStatus.ok": "In stock",
  "customerFilter.withDebt": "With debt",
  "customerFilter.paid": "Paid",
  "reportPeriod.today": "Today",
  "reportPeriod.week": "This week",
  "reportPeriod.month": "This month",

  "invitation.status.accepted": "Accepted",
  "invitation.status.revoked": "Revoked",
  "invitation.status.expired": "Expired",
  "invitation.status.pending": "Pending",

  "paymentMethod.cash": "Cash",
  "paymentMethod.mpesa": "M-Pesa",
  "paymentMethod.tigoPesa": "Tigo Pesa",
  "paymentMethod.airtelMoney": "Airtel Money",
  "paymentMethod.haloPesa": "HaloPesa",
  "paymentMethod.bank": "Bank",

  "category.food": "Food",
  "category.drinks": "Drinks",
  "category.cleaning": "Cleaning",
  "category.cosmetics": "Cosmetics",
  "category.medicine": "Medicine",
  "category.other": "Other",

  "unit.pieces": "pcs",
  "unit.kg": "kg",
  "unit.g": "g",
  "unit.litre": "Litre",
  "unit.ml": "ml",
  "unit.pack": "Pack",
  "unit.box": "Box",
  "unit.dozen": "Dozen",

  "expenseCategory.shopRent": "Shop rent",
  "expenseCategory.electricity": "Electricity",
  "expenseCategory.water": "Water",
  "expenseCategory.salaries": "Salaries",
  "expenseCategory.transport": "Transport",
  "expenseCategory.communication": "Communication",
  "expenseCategory.maintenance": "Maintenance",
  "expenseCategory.food": "Food",
  "expenseCategory.taxes": "Taxes & levies",
  "expenseCategory.other": "Other",

  "inventoryMovement.inOption": "Stock in",
  "inventoryMovement.outOption": "Stock out",
  "inventoryMovement.adjustmentOption": "Adjust quantity (count)",
  "inventoryMovement.damageOption": "Damage / loss",
  "inventoryMovement.in": "Stock in",
  "inventoryMovement.out": "Stock out",
  "inventoryMovement.adjustment": "Adjustment",
  "inventoryMovement.damage": "Damage",
  "inventoryMovement.transfer": "Transfer",
  "inventoryMovement.sale": "Sale",
  "inventoryMovement.purchase": "Purchase",
  "inventoryMovement.refund": "Refund",

  "dashboard.warningModulesNotSetup":
    "Some modules are not set up in the database. An administrator needs to run the migrations.",
  "dashboard.warningStatsLoadFailed":
    "Could not load some statistics: {detail}",
  "dashboard.unavailable":
    "Current statistics are unavailable because the database modules are incomplete. Please contact an administrator.",
  "dashboard.loading": "Loading statistics...",
  "dashboard.todaySales": "Today's sales",
  "dashboard.todaySalesDetail": "{count} receipts · {amount} paid",
  "dashboard.grossProfitToday": "Gross profit today",
  "dashboard.grossProfitHint": "Sales – cost of goods",
  "dashboard.expensesToday": "Expenses today",
  "dashboard.netProfit": "Net profit: {amount}",
  "dashboard.inventoryDetail": "{products} products · {units} units",
  "dashboard.salesTrend": "Sales trend",
  "dashboard.lastSevenDays": "Last seven days",
  "dashboard.thisWeek": "This week",
  "dashboard.weekTotal": "Weekly total: {amount}",
  "dashboard.creditSalesToday": "Credit sales today: {amount}",
  "dashboard.customerDebt": "Customer debt: {amount}",
  "dashboard.lowStock": "Low stock",
  "dashboard.lowStockHint": "These items need restocking",
  "dashboard.lowStockEmpty": "All stock levels are healthy.",
  "dashboard.buyLink": "Buy",
  "dashboard.recentSales": "Recent sales",
  "dashboard.recentSalesHint": "The latest recorded receipts",
  "dashboard.viewAll": "View all",
  "dashboard.noSalesYet": "No sales yet.",
  "dashboard.recordFirstSale": "Record your first sale.",
  "dashboard.bestSellers": "Best-selling products",
  "dashboard.last7Days": "Last 7 days",
  "dashboard.noSalesDataYet": "No sales data yet.",
  "dashboard.units": "{count} units",

  "sales.setupHint":
    "This module needs the database setup (migrations) to be completed before it can be used.",
  "sales.errorLoadProducts": "Could not load products: {detail}",
  "sales.errorOutOfStock": "\"{product}\" is out of stock.",
  "sales.errorInsufficientStock": "Insufficient stock for \"{product}\".",
  "sales.errorEmptyCart": "Add products to the cart first.",
  "sales.errorInsufficientPayment":
    "The amount paid is insufficient. Select a customer for a credit sale.",
  "sales.errorRpcInsufficientStock":
    "Insufficient stock for one or more selected products. Check quantities and try again.",
  "sales.errorPaymentShort": "The amount paid is insufficient.",
  "sales.errorNoPermissionComplete": "You do not have permission to make sales.",
  "sales.errorProductNotFound": "The product was not found in this business.",
  "sales.errorCompleteFailed": "Could not complete the sale. Please try again.",
  "sales.errorNoPermissionCancel":
    "You do not have permission to cancel sales.",
  "sales.cancelReasonPrompt": "Reason for cancelling receipt {receipt}:",
  "sales.errorCancelFailed": "Could not cancel the sale: {detail}",
  "sales.noticeCancelled":
    "Receipt {receipt} was cancelled and the stock was restored.",
  "sales.itemsCount": "{count} items",
  "sales.selectProducts": "Select products",
  "sales.searchPlaceholder": "Search products or SKU...",
  "sales.loading": "Loading products...",
  "sales.noProductsFound":
    "No products found. Add products on the Products page.",
  "sales.inCart": "In cart: {count}",
  "sales.stockLabel": "Stock: {qty} {unit}",
  "sales.recentSales": "Recent sales",
  "sales.recentSalesHint": "Saved sales records.",
  "sales.noSalesRecorded": "No sales have been recorded yet.",
  "sales.cancelSale": "Cancel sale",
  "sales.cartTitle": "Sales cart",
  "sales.itemsSelected": "{count} items selected",
  "sales.cartEmpty": "The cart is empty",
  "sales.cartEmptyHint": "Select a product to start a sale.",
  "sales.subtotal": "Subtotal",
  "sales.discount": "Discount (TZS)",
  "sales.paymentMethod": "Payment method",
  "sales.paidByCustomer": "Amount paid by customer",
  "sales.customerOptional": "Customer (optional, for credit sales)",
  "sales.creditNotice":
    "Credit sale: a debt of {amount} will be added to the customer.",
  "sales.completing": "Completing...",
  "sales.completeSale": "Complete sale",
  "sales.receiptTitle": "Sales receipt",
  "sales.receiptSubtitle": "Sales receipt · Biashara Mkononi",
  "sales.receiptNumberLabel": "No: ",
  "sales.receiptPaymentLabel": "Payment: ",
  "sales.receiptPaid": "Amount paid",
  "sales.receiptThanks": "Thank you for doing business with us!",
  "sales.change": "Change",
  "sales.print": "Print",

  "products.setupHint":
    "The products module is not fully set up. An administrator needs to run the migrations.",
  "products.errorLoad": "Could not load products: {detail}",
  "products.errorNoBusiness": "Business not found. Please sign in again.",
  "products.errorNameRequired": "Enter the product name.",
  "products.errorInvalidPrices": "Product prices must be valid numbers.",
  "products.errorNegativeStock": "Stock quantity cannot be negative.",
  "products.errorUpdate": "Could not save: {detail}",
  "products.noticeUpdated": "Product updated.",
  "products.errorInsert": "Could not save the product: {detail}",
  "products.errorInsertFallback":
    "Could not save the product. Please try again.",
  "products.errorOpeningStock":
    "The product was saved, but opening stock was not recorded: {detail}",
  "products.noticeCreated": "Product registered.",
  "products.errorArchive": "Could not change the status: {detail}",
  "products.noticeRestored": "\"{product}\" has been restored to sales.",
  "products.noticeArchived":
    "\"{product}\" has been archived and will not appear in sales.",
  "products.confirmDelete":
    "Permanently delete \"{product}\"? This action cannot be undone.",
  "products.errorDelete":
    "Could not delete the product. If it has been used in sales, archive it instead. ({detail})",
  "products.noticeDeleted": "Product deleted.",
  "products.addProduct": "Add product",
  "products.activeProducts": "Active products",
  "products.lowStock": "Low stock",
  "products.totalUnits": "Total units",
  "products.editProduct": "Edit product",
  "products.newProduct": "Register a new product",
  "products.editStockHint":
    "Stock quantities are changed on the Inventory page so the movement history is kept.",
  "products.newStockHint":
    "The new product will be added to stock with the opening quantity.",
  "products.fieldName": "Product name",
  "products.namePlaceholder": "Example: Sugar 1 kg",
  "products.fieldSku": "SKU",
  "products.fieldBarcode": "Barcode",
  "products.fieldCategory": "Category",
  "products.fieldUnit": "Unit",
  "products.fieldLowStock": "Low stock threshold",
  "products.fieldBuyingPrice": "Buying price (TZS)",
  "products.fieldSellingPrice": "Selling price (TZS)",
  "products.fieldCurrentStock": "Quantity in stock",
  "products.fieldOpeningStock": "Opening quantity",
  "products.saving": "Saving...",
  "products.saveChanges": "Save changes",
  "products.registerProduct": "Register product",
  "products.listTitle": "Product list",
  "products.foundCount": "{count} products found",
  "products.searchPlaceholder": "Search name, SKU, barcode...",
  "products.tableProduct": "Product",
  "products.tableCategory": "Category",
  "products.tableBuying": "Buying",
  "products.tableSelling": "Selling",
  "products.tableProfit": "Profit",
  "products.tableStock": "Stock",
  "products.loading": "Loading products...",
  "products.noProducts": "No products found.",
  "products.editTooltip": "Edit",
  "products.restoreTooltip": "Restore to sales",
  "products.archiveTooltip": "Archive",
  "products.deleteTooltip": "Delete permanently",
  "products.archivedNote":
    "Archived products do not appear in POS, but their history remains intact.",

  "inventory.errorLoad": "Could not load products: {detail}",
  "inventory.errorNoPermission": "You do not have permission to adjust stock.",
  "inventory.errorSelectProduct": "Select a product first.",
  "inventory.errorInvalidQuantity": "Enter a valid quantity.",
  "inventory.errorPositiveQuantity": "Quantity must be greater than zero.",
  "inventory.errorInsufficientStock":
    "You cannot remove more stock than is available.",
  "inventory.errorFallbackSave": "Could not save: {detail}",
  "inventory.noticeHistoryFallback":
    "Quantity updated. Movement history will start being recorded after the migrations are installed.",
  "inventory.errorAdjust": "Could not adjust stock: {detail}",
  "inventory.noticeMovementSaved":
    "Stock for \"{name}\" updated: {before} → {after} {unit}.",
  "inventory.stats.products": "Products",
  "inventory.stats.totalUnits": "Total units",
  "inventory.stats.lowStock": "Running low",
  "inventory.stats.stockValue": "Stock value",
  "inventory.adjust.title": "Adjust stock",
  "inventory.adjust.description":
    "Every change is recorded in the movement history.",
  "inventory.adjust.selectProduct": "-- Select a product --",
  "inventory.adjust.productOption": "{name} (stock: {quantity})",
  "inventory.adjust.movementType": "Movement type",
  "inventory.adjust.newQuantity": "New quantity",
  "inventory.adjust.notePlaceholder": "Reason / notes",
  "inventory.adjust.currentStock": "Current stock for {name}: {quantity} {unit}",
  "inventory.adjust.exactCountHint": " · enter the actual counted quantity",
  "inventory.adjust.save": "Save changes",
  "inventory.list.title": "Stock list",
  "inventory.list.found": "{count} products found",
  "inventory.list.onlyLow": "Low stock only",
  "inventory.list.searchPlaceholder": "Search products...",
  "inventory.list.empty": "No products found.",
  "inventory.list.minLevel": "Minimum level",
  "inventory.list.otherCategory": "Other",
  "inventory.history.title": "Stock movement history",
  "inventory.history.subtitle": "Recent changes",
  "inventory.history.empty": "No movement history yet.",
  "inventory.history.beforeAfter": "Before → After",

  "purchases.errorModuleMissing":
    "The purchases module is not set up in the database. An administrator needs to run the migrations.",
  "purchases.errorLoad": "Could not load purchases: {detail}",
  "purchases.errorModuleMissingShort":
    "The purchases module is not set up in the database.",
  "purchases.errorAddOneItem": "Add at least one item to the purchase.",
  "purchases.errorSave": "Could not save the purchase: {detail}",
  "purchases.noticeSaved": "Purchase saved and stock was increased.",
  "purchases.errorSupplierNameRequired": "Enter the supplier name.",
  "purchases.errorSaveSupplier": "Could not save the supplier: {detail}",
  "purchases.noticeSupplierAdded": "Supplier added.",
  "purchases.promptRecordPayment":
    "Remaining debt is {amount}. Enter the amount paid now:",
  "purchases.errorInvalidPayment":
    "Enter a valid amount that does not exceed the remaining debt.",
  "purchases.errorPayment": "Could not record the payment: {detail}",
  "purchases.noticePaymentRecorded": "Payment recorded.",
  "purchases.confirmDelete": "Delete this purchase record?",
  "purchases.errorDelete":
    "Could not delete the purchase: {message} (stock that was added will not be reversed automatically)",
  "purchases.noticeDeleted": "Purchase deleted.",
  "purchases.actions.addSupplier": "+ Supplier",
  "purchases.actions.record": "Record purchase",
  "purchases.total": "Total purchases",
  "purchases.stats.paid": "Payments made",
  "purchases.stats.supplierDebts": "Supplier debts",
  "purchases.suppliers.title": "Suppliers",
  "purchases.suppliers.formTitle": "Register a new supplier",
  "purchases.suppliers.location": "Location",
  "purchases.suppliers.locationPlaceholder": "Example: Dar es Salaam",
  "purchases.suppliers.save": "Save supplier",
  "purchases.suppliers.empty": "No suppliers registered.",
  "purchases.suppliers.noLocation": "No location",
  "purchases.form.title": "Record a new purchase",
  "purchases.form.description":
    "Purchased items will be added to your stock.",
  "purchases.form.noSupplier": "No supplier",
  "purchases.form.paidAmount": "Amount paid (TZS)",
  "purchases.form.newItem": "New product / description",
  "purchases.form.itemPlaceholder": "Product name",
  "purchases.form.unitPrice": "Price (TZS)",
  "purchases.form.addLine": "Add another item",
  "purchases.form.save": "Save purchase",
  "purchases.history.title": "Purchase history",
  "purchases.history.empty": "No purchases found.",
  "purchases.reference": "Reference",
  "purchases.actions.view": "View",
  "purchases.actions.recordPayment": "Record payment",
  "purchases.details.title": "Purchase details",
  "purchases.footer":
    "Purchases are saved and automatically added to stock.",

  "expenses.errorModuleMissing":
    "The expenses module is not set up in the database. An administrator needs to run the migrations.",
  "expenses.errorLoad": "Could not load expenses: {detail}",
  "expenses.errorInvalidInput": "Enter a valid title and amount.",
  "expenses.errorSave": "Could not save the expense: {detail}",
  "expenses.noticeSaved": "Expense saved.",
  "expenses.confirmDelete": "Are you sure you want to delete this expense?",
  "expenses.errorDelete": "Could not delete: {detail}",
  "expenses.noticeDeleted": "Expense deleted.",
  "expenses.actions.record": "Record expense",
  "expenses.stats.total": "Total expenses",
  "expenses.stats.thisMonth": "This month",
  "expenses.stats.records": "Records",
  "expenses.form.title": "Record a new expense",
  "expenses.form.description": "Fill in the business cost details.",
  "expenses.form.titleLabel": "Expense title",
  "expenses.form.titlePlaceholder": "Example: Shop rent",
  "expenses.form.amount": "Amount (TZS)",
  "expenses.form.paymentMethod": "Payment method",
  "expenses.form.notesPlaceholder": "Additional notes...",
  "expenses.form.save": "Save expense",
  "expenses.history.title": "Expense history",
  "expenses.history.empty": "No expenses found.",
  "expenses.columns.expense": "Expense",
  "expenses.columns.payment": "Payment",
  "expenses.noNotes": "No notes",
  "expenses.breakdown.title": "Expenses by category",
  "expenses.footer": "All expenses are stored in your business.",

  "customers.setupHint":
    "The customers module is not set up in the database. An administrator needs to run the migrations.",
  "customers.errorLoad": "Could not load customers: {detail}",
  "customers.validation.nameRequired": "Enter the customer name.",
  "customers.errorSave": "Could not save the customer: {detail}",
  "customers.noticeUpdated": "Customer details updated.",
  "customers.noticeCreated": "Customer added.",
  "customers.confirmDelete":
    "Delete customer \"{name}\"? Sales records will remain without the customer name.",
  "customers.errorDelete": "Could not delete the customer: {detail}",
  "customers.noticeDeleted": "Customer deleted.",
  "customers.validation.invalidAmount": "Enter a valid payment amount.",
  "customers.validation.amountExceedsBalance":
    "This amount exceeds the customer's balance.",
  "customers.errorRecordPayment": "Could not record the payment: {detail}",
  "customers.errorStaleBalance":
    "The customer's balance changed or the payment was already recorded. Refresh before trying again.",
  "customers.noticeFallbackPayment":
    "Balance reduced. Note: payment history will start being recorded after the migrations are installed.",
  "customers.errorAmountExceedsCurrentBalance":
    "This amount exceeds the customer's current balance. Refresh and try again.",
  "customers.errorNotAllowed": "You do not have permission to receive payments.",
  "customers.errorInvalidPaymentAmount": "The payment amount is invalid.",
  "customers.errorCustomerNotFound": "The customer was not found in this business.",
  "customers.noticePaymentReceived": "Payment of {amount} received.",
  "customers.permission.description":
    "The customers page is available to staff with permission to manage customers.",
  "customers.add": "Add customer",
  "customers.stat.total": "All customers",
  "customers.stat.receivable": "Customer receivables",
  "customers.form.edit": "Edit customer",
  "customers.form.create": "Register a new customer",
  "customers.form.help":
    "These details are used for credit sales and receipts.",
  "customers.form.phone": "Phone",
  "customers.form.phonePlaceholder": "07XXXXXXXX",
  "customers.form.emailPlaceholder": "customer@example.com",
  "customers.form.address": "Area / address",
  "customers.form.addressPlaceholder": "Example: Kariakoo, Dar es Salaam",
  "customers.form.creditLimit": "Credit limit (TZS)",
  "customers.form.save": "Save customer",
  "customers.list.title": "Customer list",
  "customers.list.count": "{count} customers found",
  "customers.search.placeholder": "Search name, phone, email...",
  "customers.filter.withDebt": "With debt",
  "customers.filter.paid": "Paid",
  "customers.empty": "No customers found.",
  "customers.table.customer": "Customer",
  "customers.table.contact": "Contact",
  "customers.table.limit": "Limit",
  "customers.table.debt": "Debt",
  "customers.table.joined": "Joined",
  "customers.table.noAddress": "No address",
  "customers.action.history": "History",
  "customers.payment.title": "Receive payment",
  "customers.payment.remainingBalance": "Remaining balance: ",
  "customers.payment.amount": "Amount (TZS)",
  "customers.payment.method": "Payment method",
  "customers.payment.notePlaceholder": "Optional",
  "customers.payment.save": "Save payment",
  "customers.history.title": "History for {name}",
  "customers.history.subtitle": "Sales and payments for this customer.",
  "customers.history.payments": "Payments",
  "customers.history.creditSales": "Credit sales",
  "customers.history.emptySales": "No sales involve this customer.",
  "customers.history.receivedPayments": "Payments received",
  "customers.history.emptyPayments": "No payments recorded.",
  "customers.footer": "Customers and their debts are stored in your business.",

  "reports.errorSetup":
    "The reports modules are not set up in the database. An administrator needs to run the migrations.",
  "reports.errorLoad": "Could not load statistics: {detail}",
  "reports.unavailable":
    "Current reports are unavailable because the database modules are incomplete. Please contact an administrator.",
  "reports.action.print": "Print",
  "reports.permission.description":
    "Reports are available only to Owners, Admins and Managers.",
  "reports.loading": "Preparing report...",
  "reports.metric.receiptsAverage": "{count} receipts · average {amount}",
  "reports.metric.grossProfit": "Gross profit",
  "reports.metric.percentOfSales": "{percent}% of sales",
  "reports.metric.operatingCosts": "Operating costs",
  "reports.metric.netProfit": "Net profit",
  "reports.metric.grossMinusExpenses": "Gross profit – expenses",
  "reports.metric.cogs": "Cost of goods (COGS)",
  "reports.metric.creditSales": "Credit sales",
  "reports.metric.purchases": "Purchases / supplier debts",
  "reports.metric.purchaseDebt": "(debt {amount})",
  "reports.chart.title": "7-day trend",
  "reports.chart.subtitle": "Sales versus expenses",
  "reports.chart.salesTooltip": "Sales: {amount}",
  "reports.chart.expensesTooltip": "Expenses: {amount}",
  "reports.topProducts.title": "Leading products",
  "reports.topProducts.subtitle": "For sales in this period",
  "reports.topProducts.empty": "No product sales in this period.",
  "reports.table.product": "Product",
  "reports.table.quantity": "Quantity",
  "reports.table.profit": "Profit",
  "reports.expenseByCategory.title": "Expenses by category",
  "reports.expenseByCategory.empty": "No expenses in this period.",
  "reports.paymentMethods.title": "Payment methods",
  "reports.paymentMethods.empty": "No payments in this period.",
  "reports.paymentMethods.receipts": "{count} receipts",
  "reports.transactions.title": "Period transactions",
  "reports.transactions.records": "{count} records",
  "reports.transactions.empty": "No transactions in this period.",
  "reports.table.receipt": "Receipt",
  "reports.table.date": "Date",
  "reports.table.total": "Total",
  "reports.table.paid": "Paid",
  "reports.table.debt": "Debt",
  "reports.table.status": "Status",
  "reports.table.method": "Method",
  "reports.csv.receipt": "Receipt",
  "reports.csv.date": "Date",
  "reports.csv.total": "Total",
  "reports.csv.paid": "Paid",
  "reports.csv.debt": "Debt",
  "reports.csv.status": "Status",
  "reports.csv.paymentMethod": "Payment",
  "reports.export.fileName": "report-{period}-{date}.csv",

  "team.errorLoadMembers": "Could not load members: {detail}",
  "team.errorCopyLink": "Could not copy the link. Please copy it manually.",
  "team.validation.nameEmailRequired":
    "Enter the employee's name and email address.",
  "team.errorCreate": "Could not create the invitation.",
  "team.noticeCreated":
    "Invitation created. Send the link to the employee on WhatsApp or copy it.",
  "team.errorNetwork": "There is a network problem. Please try again.",
  "team.confirm.revokeInvitation": "Are you sure you want to revoke this invitation?",
  "team.errorRevoke": "Could not revoke the invitation: {detail}",
  "team.noticeRevoked": "Invitation revoked.",
  "team.errorUpdateRole": "Could not change the role: {detail}",
  "team.noticeRoleUpdated": "Role updated.",
  "team.confirm.removeMember": "Are you sure you want to remove this employee?",
  "team.errorRemove": "Could not remove the employee: {detail}",
  "team.noticeRemoved": "Employee removed.",
  "team.permission.description":
    "This page is available only to the business Owner and Admin.",
  "team.stat.members": "Members",
  "team.stat.pendingInvitations": "Pending invitations",
  "team.stat.owners": "Owners",
  "team.invite.title": "Invite an employee",
  "team.invite.subtitle": "Send a sign-up link by email or WhatsApp.",
  "team.invite.fullNamePlaceholder": "Example: Asha Mwinyi",
  "team.invite.emailPlaceholder": "employee@example.com",
  "team.invite.creating": "Creating...",
  "team.invite.submit": "Create invitation",
  "team.link.title": "Invitation link",
  "team.link.shareMessage":
    "Welcome to Biashara Mkononi. Click this link to join our team: {link}",
  "team.link.whatsapp": "Send on WhatsApp",
  "team.link.copy": "Copy link",
  "team.link.copied": "Copied",
  "team.link.open": "Open",
  "team.link.help":
    "Email is not sent automatically. Send this link via WhatsApp or copy it and send it to the employee.",
  "team.invitations.title": "Invitations",
  "team.invitations.subtitle": "Recent invitations and their status.",
  "team.invitations.empty": "No invitations yet.",
  "team.table.employee": "Employee",
  "team.table.expires": "Expires",
  "team.table.joined": "Joined",
  "team.members.title": "Business members",
  "team.members.subtitle": "Employees who have already joined.",
  "team.members.empty": "No members found.",
};

const dictionaries: Record<
  Locale,
  Record<TranslationKey, string>
> = {
  sw,
  en,
};

function isLocale(value: unknown): value is Locale {
  return value === "sw" || value === "en";
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage may be unavailable in private browsing; cookie fallback still applies.
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(sw|en)(?:;|$)`)
  );

  return match ? (match[1] as Locale) : null;
}

function translate(
  locale: Locale,
  key: TranslationKey,
  variables?: Record<string, string | number>
) {
  const template = dictionaries[locale][key] ?? dictionaries.sw[key] ?? key;
  if (!variables) return template;

  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(variables[name] ?? "")
  );
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFunction;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (!active) return;
      const stored = readStoredLocale();
      if (stored) setLocaleState(stored);
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    document.documentElement.lang = locale;

    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Cookie persistence below still works when storage is unavailable.
    }

    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback<TranslateFunction>(
    (key, variables) => translate(locale, key, variables),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}

export function roleLabel(role: string | null | undefined, t: TranslateFunction) {
  if (!role) return "";
  const key = `role.${role}` as TranslationKey;
  const label = t(key);
  return label === key ? role : label;
}

type LabelMap = Partial<Record<string, TranslationKey>>;

function mappedLabel(
  map: LabelMap,
  value: string | null | undefined,
  t: TranslateFunction
) {
  if (!value) return "";
  const key = map[value];
  return key ? t(key) : value;
}

const PAYMENT_METHOD_LABELS: LabelMap = {
  Cash: "paymentMethod.cash",
  "M-Pesa": "paymentMethod.mpesa",
  "Tigo Pesa": "paymentMethod.tigoPesa",
  "Airtel Money": "paymentMethod.airtelMoney",
  HaloPesa: "paymentMethod.haloPesa",
  Benki: "paymentMethod.bank",
  Bank: "paymentMethod.bank",
};

const PRODUCT_CATEGORY_LABELS: LabelMap = {
  Zote: "common.all",
  Vyakula: "category.food",
  Vinywaji: "category.drinks",
  Usafi: "category.cleaning",
  Vipodozi: "category.cosmetics",
  Dawa: "category.medicine",
  Nyingine: "category.other",
};

const UNIT_LABELS: LabelMap = {
  pcs: "unit.pieces",
  kg: "unit.kg",
  g: "unit.g",
  lita: "unit.litre",
  ml: "unit.ml",
  pakiti: "unit.pack",
  boksi: "unit.box",
  dozen: "unit.dozen",
};

const EXPENSE_CATEGORY_LABELS: LabelMap = {
  Zote: "common.allCategories",
  "Kodi ya Fremu": "expenseCategory.shopRent",
  Umeme: "expenseCategory.electricity",
  Maji: "expenseCategory.water",
  Mishahara: "expenseCategory.salaries",
  Usafiri: "expenseCategory.transport",
  Mawasiliano: "expenseCategory.communication",
  Matengenezo: "expenseCategory.maintenance",
  Chakula: "expenseCategory.food",
  "Ushuru na Kodi": "expenseCategory.taxes",
  Mengineyo: "expenseCategory.other",
};

const INVENTORY_MOVEMENT_LABELS: LabelMap = {
  in: "inventoryMovement.in",
  out: "inventoryMovement.out",
  adjustment: "inventoryMovement.adjustment",
  damage: "inventoryMovement.damage",
  transfer: "inventoryMovement.transfer",
  sale: "inventoryMovement.sale",
  purchase: "inventoryMovement.purchase",
  refund: "inventoryMovement.refund",
};

const PURCHASE_STATUS_LABELS: LabelMap = {
  paid: "purchaseStatus.paid",
  partial: "purchaseStatus.partial",
  pending: "purchaseStatus.pending",
  cancelled: "purchaseStatus.cancelled",
};

const SALE_STATUS_LABELS: LabelMap = {
  completed: "status.completed",
  cancelled: "status.cancelled",
};

const PRODUCT_STATUS_LABELS: LabelMap = {
  Zote: "common.all",
  Hai: "productStatus.active",
  "Zilizowekwa kando": "productStatus.archived",
};

const CUSTOMER_FILTER_LABELS: LabelMap = {
  Zote: "common.all",
  "Wenye deni": "customerFilter.withDebt",
  Waliolipa: "customerFilter.paid",
};

const REPORT_PERIOD_LABELS: LabelMap = {
  Leo: "reportPeriod.today",
  Wiki: "reportPeriod.week",
  Mwezi: "reportPeriod.month",
};

export function paymentMethodLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(PAYMENT_METHOD_LABELS, value, t);
}

export function productCategoryLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(PRODUCT_CATEGORY_LABELS, value, t);
}

export function unitLabel(value: string | null | undefined, t: TranslateFunction) {
  return mappedLabel(UNIT_LABELS, value, t);
}

export function expenseCategoryLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(EXPENSE_CATEGORY_LABELS, value, t);
}

export function inventoryMovementLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(INVENTORY_MOVEMENT_LABELS, value, t);
}

export function purchaseStatusLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(PURCHASE_STATUS_LABELS, value, t);
}

export function saleStatusLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(SALE_STATUS_LABELS, value, t);
}

export function productStatusLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(PRODUCT_STATUS_LABELS, value, t);
}

export function customerFilterLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(CUSTOMER_FILTER_LABELS, value, t);
}

export function reportPeriodLabel(
  value: string | null | undefined,
  t: TranslateFunction
) {
  return mappedLabel(REPORT_PERIOD_LABELS, value, t);
}
