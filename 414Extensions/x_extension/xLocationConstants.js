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
    { name: 'East Asia & Pacific', key: 'east asia & pacific', flag: '🌏' },
    { name: 'Europe', key: 'europe', flag: '🌍' },
    { name: 'North Africa', key: 'north africa', flag: '🌍' },
    { name: 'North America', key: 'north america', flag: '🌎' },
    { name: 'South America', key: 'south america', flag: '🌎' },
    { name: 'South Asia', key: 'south asia', flag: '🌏' },
    { name: 'Southeast Asia', key: 'southeast asia', flag: '🌏' },
    { name: 'West Asia', key: 'west asia', flag: '🌍' }
];

export const REGION_FLAGS = Object.fromEntries(
    REGION_DATA.map(r => [r.key, r.flag])
);
