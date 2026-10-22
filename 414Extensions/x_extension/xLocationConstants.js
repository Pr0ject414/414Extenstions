// 414Extensions/x_extension/xLocationConstants.js

export const BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export const API_CONFIG = {
    QUERY_ID: 'XRqGa7EeokUU5kppkh13EA', // AboutAccountQuery
    BASE_URL: 'https://x.com/i/api/graphql',
    MIN_INTERVAL_MS: 150,
    MAX_CONCURRENT: 8,
    RETRY_DELAY_MS: 1000,
    MAX_RETRIES: 2,
    RATE_LIMIT_WINDOW_MS: 60000
};

export const CACHE_CONFIG = {
    EXPIRY_MS: 60 * 24 * 60 * 60 * 1000, // 60 days
    MAX_ENTRIES: 50000,
    SAVE_INTERVAL_MS: 60000
};

export const CLOUD_CACHE_CONFIG = {
    API_URL: 'https://x-posed-cache.xaitax.workers.dev',
    BATCH_SIZE: 100,
    BATCH_DELAY_MS: 200,
    LOOKUP_MAX_WAIT_MS: 500,
    LOOKUP_TIMEOUT_MS: 5000,
    MAX_RETRIES: 1,
    RETRY_DELAY_MS: 2000
};

export const FRIEND_SYNC_CONFIG = {
    RELAYS: [
        'wss://nos.lol',
        'wss://offchain.pub',
        'wss://relay.primal.net',
        'wss://nostr.mom'
    ],
    NOSTR_KIND_APP_DATA: 30078, // NIP-78 Parameterized Replaceable Event
    DWELL_TIME_MS: 1200,        // 1.2s at >= 60% visibility marks post as seen
    VISIBILITY_THRESHOLD: 0.6,
    BATCH_FLUSH_DELAY_MS: 15000, // Debounce before publishing updated seen snapshot
    SYNC_INTERVAL_MINUTES: 2,    // Background alarm interval for pulling friends' updates
    MAX_SEEN_IDS: 3000,
    MAX_AGE_MS: 14 * 24 * 60 * 60 * 1000, // 14 days
    RELAY_TIMEOUT_MS: 5000
};

export const SELECTORS = {
    USERNAME: '[data-testid="UserName"], [data-testid="User-Name"]',
    TWEET: 'article[data-testid="tweet"]',
    USER_CELL: '[data-testid="UserCell"]',
    PROFILE_LINK: '[data-testid="AppTabBar_Profile_Link"]',
    PRIMARY_NAV: 'nav[aria-label="Primary"]',
    NAV_ROLE: 'nav[role="navigation"]'
};

export const CSS_CLASSES = {
    FLAG_SHIMMER: 'x-flag-shimmer',
    INFO_BADGE: 'x-info-badge',
    TWEET_BLOCKED: 'x-tweet-blocked',
    MODAL_OVERLAY: 'x-blocker-modal-overlay',
    MODAL: 'x-blocker-modal',
    PROCESSED: 'x-processed'
};

export const COUNTRY_FLAGS = {
    'afghanistan': '🇦🇫', 'albania': '🇦🇱', 'algeria': '🇩🇿', 'andorra': '🇦🇩', 'angola': '🇦🇴',
    'antigua and barbuda': '🇦🇬', 'argentina': '🇦🇷', 'armenia': '🇦🇲', 'australia': '🇦🇺', 'austria': '🇦🇹',
    'azerbaijan': '🇦🇿', 'bahamas': '🇧🇸', 'bahrain': '🇧🇭', 'bangladesh': '🇧🇩', 'barbados': '🇧🇧',
    'belarus': '🇧🇾', 'belgium': '🇧🇪', 'belize': '🇧🇿', 'benin': '🇧🇯', 'bhutan': '🇧🇹',
    'bolivia': '🇧🇴', 'bosnia and herzegovina': '🇧🇦', 'bosnia': '🇧🇦', 'botswana': '🇧🇼', 'brazil': '🇧🇷',
    'brunei': '🇧🇳', 'bulgaria': '🇧🇬', 'burkina faso': '🇧🇫', 'burundi': '🇧🇮', 'cambodia': '🇰🇭',
    'cameroon': '🇨🇲', 'canada': '🇨🇦', 'cape verde': '🇨🇻', 'central african republic': '🇨🇫', 'chad': '🇹🇩',
    'chile': '🇨🇱', 'china': '🇨🇳', 'colombia': '🇨🇴', 'comoros': '🇰🇲', 'congo': '🇨🇬',
    'costa rica': '🇨🇷', 'croatia': '🇭🇷', 'cuba': '🇨🇺', 'cyprus': '🇨🇾', 'czech republic': '🇨🇿',
    'czechia': '🇨🇿', 'democratic republic of the congo': '🇨🇩', 'denmark': '🇩🇰', 'djibouti': '🇩🇯', 'dominica': '🇩🇲',
    'dominican republic': '🇩🇴', 'east timor': '🇹🇱', 'ecuador': '🇪🇨', 'egypt': '🇪🇬', 'el salvador': '🇸🇻',
    'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'equatorial guinea': '🇬🇶', 'eritrea': '🇪🇷', 'estonia': '🇪🇪', 'eswatini': '🇸🇿',
    'ethiopia': '🇪🇹', 'europe': '🇪🇺', 'european union': '🇪🇺', 'fiji': '🇫🇯', 'finland': '🇫🇮',
    'france': '🇫🇷', 'gabon': '🇬🇦', 'gambia': '🇬🇲', 'georgia': '🇬🇪', 'germany': '🇩🇪',
    'ghana': '🇬🇭', 'greece': '🇬🇷', 'grenada': '🇬🇩', 'guatemala': '🇬🇹', 'guinea': '🇬🇳',
    'guinea-bissau': '🇬🇼', 'guyana': '🇬🇾', 'haiti': '🇭🇹', 'honduras': '🇭🇳', 'hong kong': '🇭🇰',
    'hungary': '🇭🇺', 'iceland': '🇮🇸', 'india': '🇮🇳', 'indonesia': '🇮🇩', 'iran': '🇮🇷',
    'iraq': '🇮🇶', 'ireland': '🇮🇪', 'israel': '🇮🇱', 'italy': '🇮🇹', 'ivory coast': '🇨🇮',
    'jamaica': '🇯🇲', 'japan': '🇯🇵', 'jordan': '🇯🇴', 'kazakhstan': '🇰🇿', 'kenya': '🇰🇪',
    'kiribati': '🇰🇮', 'korea': '🇰🇷', 'kosovo': '🇽🇰', 'kuwait': '🇰🇼', 'kyrgyzstan': '🇰🇬',
    'laos': '🇱🇦', 'latvia': '🇱🇻', 'lebanon': '🇱🇧', 'lesotho': '🇱🇸', 'liberia': '🇱🇷',
    'libya': '🇱🇾', 'liechtenstein': '🇱🇮', 'lithuania': '🇱🇹', 'luxembourg': '🇱🇺', 'macao': '🇲🇴',
    'macau': '🇲🇴', 'madagascar': '🇲🇬', 'malawi': '🇲🇼', 'malaysia': '🇲🇾', 'maldives': '🇲🇻',
    'mali': '🇲🇱', 'malta': '🇲🇹', 'marshall islands': '🇲🇭', 'mauritania': '🇲🇷', 'mauritius': '🇲🇺',
    'mexico': '🇲🇽', 'micronesia': '🇫🇲', 'moldova': '🇲🇩', 'monaco': '🇲🇨', 'mongolia': '🇲🇳',
    'montenegro': '🇲🇪', 'morocco': '🇲🇦', 'mozambique': '🇲🇿', 'myanmar': '🇲🇲', 'burma': '🇲🇲',
    'namibia': '🇳🇦', 'nauru': '🇳🇷', 'nepal': '🇳🇵', 'netherlands': '🇳🇱', 'new zealand': '🇳🇿',
    'nicaragua': '🇳🇮', 'niger': '🇳🇪', 'nigeria': '🇳🇬', 'north korea': '🇰🇵', 'north macedonia': '🇲🇰',
    'macedonia': '🇲🇰', 'norway': '🇳🇴', 'oman': '🇴🇲', 'pakistan': '🇵🇰', 'palau': '🇵🇼',
    'palestine': '🇵🇸', 'panama': '🇵🇦', 'papua new guinea': '🇵🇬', 'paraguay': '🇵🇾', 'peru': '🇵🇪',
    'philippines': '🇵🇭', 'poland': '🇵🇱', 'portugal': '🇵🇹', 'puerto rico': '🇵🇷', 'qatar': '🇶🇦',
    'romania': '🇷🇴', 'russia': '🇷🇺', 'russian federation': '🇷🇺', 'rwanda': '🇷🇼', 'saint kitts and nevis': '🇰🇳',
    'saint lucia': '🇱🇨', 'saint vincent and the grenadines': '🇻🇨', 'samoa': '🇼🇸', 'san marino': '🇸🇲', 'sao tome and principe': '🇸🇹',
    'saudi arabia': '🇸🇦', 'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'senegal': '🇸🇳', 'serbia': '🇷🇸', 'seychelles': '🇸🇨',
    'sierra leone': '🇸🇱', 'singapore': '🇸🇬', 'slovakia': '🇸🇰', 'slovenia': '🇸🇮', 'solomon islands': '🇸🇧',
    'somalia': '🇸🇴', 'south africa': '🇿🇦', 'south korea': '🇰🇷', 'south sudan': '🇸🇸', 'spain': '🇪🇸',
    'sri lanka': '🇱🇰', 'sudan': '🇸🇩', 'suriname': '🇸🇷', 'sweden': '🇸🇪', 'switzerland': '🇨🇭',
    'syria': '🇸🇾', 'taiwan': '🇹🇼', 'tajikistan': '🇹🇯', 'tanzania': '🇹🇿', 'thailand': '🇹🇭',
    'timor-leste': '🇹🇱', 'togo': '🇹🇬', 'tonga': '🇹🇴', 'trinidad and tobago': '🇹🇹', 'tunisia': '🇹🇳',
    'turkey': '🇹🇷', 'türkiye': '🇹🇷', 'turkmenistan': '🇹🇲', 'tuvalu': '🇹🇻', 'uganda': '🇺🇬',
    'ukraine': '🇺🇦', 'united arab emirates': '🇦🇪', 'uae': '🇦🇪', 'united kingdom': '🇬🇧', 'uk': '🇬🇧',
    'great britain': '🇬🇧', 'britain': '🇬🇧', 'united states': '🇺🇸', 'usa': '🇺🇸', 'us': '🇺🇸',
    'uruguay': '🇺🇾', 'uzbekistan': '🇺🇿', 'vanuatu': '🇻🇺', 'vatican city': '🇻🇦', 'venezuela': '🇻🇪',
    'vietnam': '🇻🇳', 'viet nam': '🇻🇳', 'wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'yemen': '🇾🇪', 'zambia': '🇿🇲', 'zimbabwe': '🇿🇼'
};

export const REGION_DATA = [
    { name: 'Africa', key: 'africa', flag: '🌍' },
    { name: 'Australasia', key: 'australasia', flag: '🌏' },
    { name: 'Central America', key: 'central america', flag: '🌎' },
    { name: 'Central Asia', key: 'central asia', flag: '🌏' },
    { name: 'East Asia', key: 'east asia', flag: '🌏' },
    { name: 'East Asia & Pacific', key: 'east asia & pacific', flag: '🌏' },
    { name: 'Eastern Europe', key: 'eastern europe', flag: '🌍' },
    { name: 'Europe', key: 'europe', flag: '🌍' },
    { name: 'Latin America', key: 'latin america', flag: '🌎' },
    { name: 'Middle East', key: 'middle east', flag: '🌍' },
    { name: 'North Africa', key: 'north africa', flag: '🌍' },
    { name: 'North America', key: 'north america', flag: '🌎' },
    { name: 'Oceania', key: 'oceania', flag: '🌏' },
    { name: 'South America', key: 'south america', flag: '🌎' },
    { name: 'South Asia', key: 'south asia', flag: '🌏' },
    { name: 'Southeast Asia', key: 'southeast asia', flag: '🌏' },
    { name: 'West Asia', key: 'west asia', flag: '🌍' },
    { name: 'Western Europe', key: 'western europe', flag: '🌍' }
];

export const DEVICE_STORE_DATA = [
    { name: 'App Store', key: 'app store', flag: '🍎' },
    { name: 'Google Play', key: 'google play', flag: '🤖' },
    { name: 'Android', key: 'android', flag: '🤖' },
    { name: 'Android App', key: 'android app', flag: '🤖' },
    { name: 'iPhone', key: 'iphone', flag: '🍎' },
    { name: 'iPad', key: 'ipad', flag: '🍎' },
    { name: 'iOS', key: 'ios', flag: '🍎' },
    { name: 'Mac', key: 'mac', flag: '🍎' },
    { name: 'Web', key: 'web', flag: '🌐' },
    { name: 'X for Web', key: 'x for web', flag: '🌐' },
    { name: 'Africa App Store', key: 'africa app store', flag: '🌍' },
    { name: 'Africa Android App', key: 'africa android app', flag: '🌍' },
    { name: 'Australasia App Store', key: 'australasia app store', flag: '🌏' },
    { name: 'Australasia Android App', key: 'australasia android app', flag: '🌏' },
    { name: 'East Asia & Pacific App Store', key: 'east asia & pacific app store', flag: '🌏' },
    { name: 'East Asia & Pacific Android App', key: 'east asia & pacific android app', flag: '🌏' },
    { name: 'Europe App Store', key: 'europe app store', flag: '🌍' },
    { name: 'Europe Android App', key: 'europe android app', flag: '🌍' },
    { name: 'Middle East App Store', key: 'middle east app store', flag: '🌍' },
    { name: 'Middle East Android App', key: 'middle east android app', flag: '🌍' },
    { name: 'North Africa App Store', key: 'north africa app store', flag: '🌍' },
    { name: 'North Africa Android App', key: 'north africa android app', flag: '🌍' },
    { name: 'North America App Store', key: 'north america app store', flag: '🌎' },
    { name: 'North America Android App', key: 'north america android app', flag: '🌎' },
    { name: 'South America App Store', key: 'south america app store', flag: '🌎' },
    { name: 'South America Android App', key: 'south america android app', flag: '🌎' },
    { name: 'South Asia App Store', key: 'south asia app store', flag: '🌏' },
    { name: 'South Asia Android App', key: 'south asia android app', flag: '🌏' },
    { name: 'Southeast Asia App Store', key: 'southeast asia app store', flag: '🌏' },
    { name: 'Southeast Asia Android App', key: 'southeast asia android app', flag: '🌏' },
    { name: 'West Asia App Store', key: 'west asia app store', flag: '🌍' },
    { name: 'West Asia Android App', key: 'west asia android app', flag: '🌍' }
];

export const REGION_FLAGS = Object.fromEntries(
    REGION_DATA.map(r => [r.key, r.flag])
);
