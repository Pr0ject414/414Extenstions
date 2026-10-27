// D:\Dev\X414\src\components\SettingsBottomSheet.js
// Slide-up Native Dark-Mode Settings & Friends Sync Bottom Sheet for Google Pixel
import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Switch,
    StyleSheet
} from 'react-native';
import {
    COUNTRY_FLAGS_MAP,
    DEVICE_REGION_MAP,
    NAME_FLAG_MAP
} from '../shared/filterOptions.js';

function FilterBlockSection({
    title,
    subtitle,
    itemsMap,
    defaultIcon,
    blockedList = [],
    onUpdateBlocked
}) {
    const [query, setQuery] = useState('');

    const matchingSuggestions = useMemo(() => {
        const clean = query.trim().toLowerCase();
        const allKeys = Object.keys(itemsMap || {}).sort();
        if (!clean) {
            return allKeys.filter(k => !blockedList.includes(k)).slice(0, 8);
        }
        return allKeys
            .filter(k => !blockedList.includes(k) && (
                k.toLowerCase().includes(clean) ||
                (itemsMap[k] && itemsMap[k].toLowerCase().includes(clean))
            ))
            .slice(0, 12);
    }, [query, itemsMap, blockedList]);

    const handleAddItem = (itemValue) => {
        const cleanVal = String(itemValue || '').trim();
        if (!cleanVal) return;
        const exists = blockedList.some(existing => existing.toLowerCase() === cleanVal.toLowerCase());
        if (!exists) {
            onUpdateBlocked([...blockedList, cleanVal]);
        }
        setQuery('');
    };

    const handleRemoveItem = (itemValue) => {
        onUpdateBlocked(blockedList.filter(c => c !== itemValue));
    };

    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}

            <View style={styles.inputRow}>
                <TextInput
                    style={styles.textInput}
                    placeholder="Search or enter custom rule..."
                    placeholderTextColor="#71767b"
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={() => handleAddItem(matchingSuggestions[0] || query)}
                />
                <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleAddItem(matchingSuggestions[0] || query)}
                >
                    <Text style={styles.primaryBtnText}>Block</Text>
                </TouchableOpacity>
            </View>

            {/* Quick suggestion pills */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.suggestionsScroll}
                contentContainerStyle={styles.suggestionsContent}
            >
                {matchingSuggestions.map(name => (
                    <TouchableOpacity
                        key={name}
                        style={styles.suggestionPill}
                        onPress={() => handleAddItem(name)}
                    >
                        <Text style={styles.suggestionText}>
                            + {itemsMap[name] || defaultIcon} {name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Active Blocked Chips */}
            <View style={styles.chipsWrap}>
                {blockedList.length === 0 ? (
                    <Text style={styles.emptyHint}>None blocked yet.</Text>
                ) : (
                    blockedList.map(item => (
                        <TouchableOpacity
                            key={item}
                            style={styles.blockedChip}
                            onPress={() => handleRemoveItem(item)}
                        >
                            <Text style={styles.blockedChipText}>
                                {itemsMap[item] || defaultIcon} {item}  ✕
                            </Text>
                        </TouchableOpacity>
                    ))
                )}
            </View>
        </View>
    );
}

export default function SettingsBottomSheet({
    visible,
    onClose,
    coordinator
}) {
    const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'filters' | 'general'
    const [friendsState, setFriendsState] = useState(null);
    const [settings, setSettings] = useState({});
    const [cacheStats, setCacheStats] = useState({ totalCached: 0 });
    const [myEmailInput, setMyEmailInput] = useState('');
    const [myPassphraseInput, setMyPassphraseInput] = useState('');
    const [friendEmailInput, setFriendEmailInput] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [statusError, setStatusError] = useState(false);

    const showStatus = (msg, isErr = false) => {
        setStatusMsg(msg);
        setStatusError(isErr);
    };

    const refreshAllState = async () => {
        if (!coordinator) return;
        const stored = await coordinator.storageAdapter.get(null);
        setSettings(stored || {});

        const fRes = await coordinator.dispatchRuntimeMessage({ action: 'X_FRIENDS_GET_STATE' });
        if (fRes && fRes.success && fRes.state) {
            setFriendsState(fRes.state);
            if (fRes.state.identity?.email && !myEmailInput) {
                setMyEmailInput(fRes.state.identity.email);
            }
        }

        const cRes = await coordinator.dispatchRuntimeMessage({ action: 'X_GET_LOCATION_STATS' });
        if (cRes && cRes.success && cRes.stats) {
            setCacheStats(cRes.stats);
        }
    };

    useEffect(() => {
        if (visible) {
            refreshAllState();
        }
    }, [visible]);

    const updateSettingKey = async (key, value) => {
        const next = { ...settings, [key]: value };
        setSettings(next);
        if (coordinator) {
            await coordinator.storageAdapter.set({ [key]: value });
        }
    };

    const handleSaveIdentity = async () => {
        if (!coordinator) return;
        const cleanEmail = myEmailInput.trim();
        if (!cleanEmail || cleanEmail.length < 3) {
            showStatus('Enter a valid email or alias (min 3 chars).', true);
            return;
        }
        showStatus('Syncing identity & self-sync state over Nostr...');
        const res = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_SET_IDENTITY',
            payload: {
                email: cleanEmail,
                passphrase: myPassphraseInput.trim()
            }
        });
        if (res && res.success) {
            setFriendsState(res.state);
            const stored = await coordinator.storageAdapter.get(null);
            setSettings(stored || {});
            showStatus('Identity & Desktop/Mobile self-sync active!');
        } else {
            showStatus(res?.error || 'Failed to save identity.', true);
        }
    };

    const handleAddFriend = async () => {
        if (!coordinator) return;
        const cleanFriend = friendEmailInput.trim();
        if (!cleanFriend) {
            showStatus('Enter a friend email or alias.', true);
            return;
        }
        showStatus('Sending Nostr handshake...');
        const res = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_ADD',
            payload: { email: cleanFriend }
        });
        if (res && res.success) {
            setFriendEmailInput('');
            setFriendsState(res.state);
            showStatus(`Invite sent to ${cleanFriend}!`);
        } else {
            showStatus(res?.error || 'Failed to add friend.', true);
        }
    };

    const handleAcceptFriend = async (email) => {
        if (!coordinator) return;
        const res = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_ACCEPT',
            payload: { email }
        });
        if (res && res.success) {
            setFriendsState(res.state);
            showStatus(`Connected with ${email}!`);
        }
    };

    const handleRemoveFriend = async (email) => {
        if (!coordinator) return;
        const res = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_REMOVE',
            payload: { email }
        });
        if (res && res.success) {
            setFriendsState(res.state);
            showStatus(`Removed ${email}.`);
        }
    };

    const handleForceSync = async () => {
        if (!coordinator) return;
        showStatus('Syncing with Nostr relays...');
        const res = await coordinator.dispatchRuntimeMessage({
            action: 'X_FRIENDS_FORCE_SYNC'
        });
        if (res && res.success) {
            setFriendsState(res.state);
            const stored = await coordinator.storageAdapter.get(null);
            setSettings(stored || {});
            showStatus('Synced with Nostr relays!');
        } else {
            showStatus(res?.error || 'Relay sync failed.', true);
        }
    };

    const handleClearLocationCache = async () => {
        if (!coordinator) return;
        await coordinator.dispatchRuntimeMessage({ action: 'X_CLEAR_LOCATION_CACHE' });
        setCacheStats({ totalCached: 0 });
    };

    const handleSendTestNotification = async () => {
        if (!coordinator) return;
        await coordinator.dispatchRuntimeMessage({ action: 'X_SEND_TEST_NOTIFICATION' });
    };

    const friendsList = Array.isArray(friendsState?.friends) ? friendsState.friends : [];
    const incomingInvites = friendsList.filter(f => f.status === 'pending_incoming');
    const activeFriends = friendsList.filter(f => f.status !== 'pending_incoming');
    const currentVolumePct = Math.round(((settings.xVolumeLevel !== undefined ? settings.xVolumeLevel : 1.0)) * 100);

    return (
        <Modal
            visible={Boolean(visible)}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    {/* Drag Handle & Header */}
                    <View style={styles.handleBar} />
                    <View style={styles.headerRow}>
                        <View style={styles.brandRow}>
                            <View style={styles.brandBadge}>
                                <Text style={styles.brandBadgeText}>414</Text>
                            </View>
                            <Text style={styles.headerTitle}>X414 Pixel Control</Text>
                        </View>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Segmented Navigation Tabs */}
                    <View style={styles.tabBar}>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === 'friends' && styles.tabBtnActive]}
                            onPress={() => setActiveTab('friends')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'friends' && styles.tabBtnTextActive]}>
                                Friends {incomingInvites.length > 0 ? `(${incomingInvites.length})` : ''}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === 'filters' && styles.tabBtnActive]}
                            onPress={() => setActiveTab('filters')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'filters' && styles.tabBtnTextActive]}>
                                Blocklists
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabBtn, activeTab === 'general' && styles.tabBtnActive]}
                            onPress={() => setActiveTab('general')}
                        >
                            <Text style={[styles.tabBtnText, activeTab === 'general' && styles.tabBtnTextActive]}>
                                Media & Sync
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
                        {activeTab === 'friends' && (
                            <>
                                {/* Identity & Multi-Device Self-Sync Card */}
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>Your Nostr Identity & Desktop Sync</Text>
                                    <Text style={styles.cardSubtitle}>
                                        Use the same email/alias as your Desktop Chrome extension to automatically sync your Nostr keys, friends, seen/forced posts, and blocklists.
                                    </Text>
                                    <View style={styles.inputRow}>
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="you@example.com or alias"
                                            placeholderTextColor="#71767b"
                                            autoCapitalize="none"
                                            value={myEmailInput}
                                            onChangeText={setMyEmailInput}
                                        />
                                        <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveIdentity}>
                                            <Text style={styles.primaryBtnText}>Save</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={[styles.inputRow, { marginTop: 8 }]}>
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Optional sync passphrase (leave blank if default)"
                                            placeholderTextColor="#71767b"
                                            autoCapitalize="none"
                                            secureTextEntry
                                            value={myPassphraseInput}
                                            onChangeText={setMyPassphraseInput}
                                        />
                                    </View>

                                    {friendsState?.identity ? (
                                        <View style={styles.selfSyncBadgeRow}>
                                            <Text style={styles.selfSyncBadgeText}>
                                                ✓ Key: {friendsState.identity.pubkeyHex?.slice(0, 12)}… • Seen: {friendsState.mySeenCount || 0} posts
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>

                                {/* Add Friend Card */}
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>Add Friend over Nostr</Text>
                                    <View style={styles.inputRow}>
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="friend@example.com or alias"
                                            placeholderTextColor="#71767b"
                                            autoCapitalize="none"
                                            value={friendEmailInput}
                                            onChangeText={setFriendEmailInput}
                                        />
                                        <TouchableOpacity style={styles.primaryBtn} onPress={handleAddFriend}>
                                            <Text style={styles.primaryBtnText}>Invite</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {statusMsg ? (
                                        <Text style={[styles.statusMsg, statusError ? styles.statusError : styles.statusOk]}>
                                            {statusMsg}
                                        </Text>
                                    ) : null}
                                </View>

                                {/* Incoming Invites */}
                                {incomingInvites.length > 0 && (
                                    <View style={styles.card}>
                                        <Text style={styles.cardTitle}>Incoming Friend Invites ({incomingInvites.length})</Text>
                                        {incomingInvites.map(req => (
                                            <View key={req.email} style={styles.inviteRow}>
                                                <Text style={styles.inviteEmail}>{req.email}</Text>
                                                <View style={styles.rowActions}>
                                                    <TouchableOpacity
                                                        style={styles.acceptBtn}
                                                        onPress={() => handleAcceptFriend(req.email)}
                                                    >
                                                        <Text style={styles.acceptBtnText}>Accept</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={styles.removeSmallBtn}
                                                        onPress={() => handleRemoveFriend(req.email)}
                                                    >
                                                        <Text style={styles.removeSmallBtnText}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Connected / Outgoing Friends */}
                                <View style={styles.card}>
                                    <View style={styles.cardHeaderBetween}>
                                        <Text style={styles.cardTitle}>Friends ({activeFriends.length})</Text>
                                        <TouchableOpacity style={styles.secondaryBtn} onPress={handleForceSync}>
                                            <Text style={styles.secondaryBtnText}>↻ Sync Relays Now</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {activeFriends.length === 0 ? (
                                        <Text style={styles.emptyHint}>No friends added yet.</Text>
                                    ) : (
                                        activeFriends.map(friend => (
                                            <View key={friend.email} style={styles.friendRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.friendName}>{friend.displayName || friend.email}</Text>
                                                    <Text style={styles.friendMeta}>
                                                        {friend.status === 'connected'
                                                            ? `● Connected • ${friend.seenCount || 0} seen`
                                                            : '○ Invite Sent (Awaiting Accept)'}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity
                                                    style={styles.removeSmallBtn}
                                                    onPress={() => handleRemoveFriend(friend.email)}
                                                >
                                                    <Text style={styles.removeSmallBtnText}>✕</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))
                                    )}
                                </View>
                            </>
                        )}

                        {activeTab === 'filters' && (
                            <>
                                <FilterBlockSection
                                    title="Block Tweet Authors by Country"
                                    subtitle="Automatically hide tweets from accounts registered in these countries."
                                    itemsMap={COUNTRY_FLAGS_MAP}
                                    defaultIcon="🌐"
                                    blockedList={Array.isArray(settings.blockedCountries) ? settings.blockedCountries : []}
                                    onUpdateBlocked={(list) => updateSettingKey('blockedCountries', list)}
                                />

                                <FilterBlockSection
                                    title="Block by Device Store / Region"
                                    subtitle="Filter out accounts using specific regional app stores or platforms."
                                    itemsMap={DEVICE_REGION_MAP}
                                    defaultIcon="📱"
                                    blockedList={Array.isArray(settings.blockedDeviceRegions) ? settings.blockedDeviceRegions : []}
                                    onUpdateBlocked={(list) => updateSettingKey('blockedDeviceRegions', list)}
                                />

                                <FilterBlockSection
                                    title="Block Display Name Flags & Symbols"
                                    subtitle="Filter out accounts containing specific flags or symbols in their display name."
                                    itemsMap={NAME_FLAG_MAP}
                                    defaultIcon="🚩"
                                    blockedList={Array.isArray(settings.blockedNameFlags) ? settings.blockedNameFlags : []}
                                    onUpdateBlocked={(list) => updateSettingKey('blockedNameFlags', list)}
                                />
                            </>
                        )}

                        {activeTab === 'general' && (
                            <>
                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>Interface & Filtering</Text>

                                    <View style={styles.toggleRow}>
                                        <View style={styles.toggleTextCol}>
                                            <Text style={styles.toggleLabel}>X414 Master Enhancement</Text>
                                            <Text style={styles.toggleHint}>Enable all X414 badges, filters, and tools</Text>
                                        </View>
                                        <Switch
                                            value={settings.isXModuleEnabled !== false}
                                            onValueChange={(v) => updateSettingKey('isXModuleEnabled', v)}
                                            trackColor={{ false: '#2f3336', true: '#1d9bf0' }}
                                        />
                                    </View>

                                    <View style={styles.toggleRow}>
                                        <View style={styles.toggleTextCol}>
                                            <Text style={styles.toggleLabel}>Account Location & Device Badges</Text>
                                            <Text style={styles.toggleHint}>Show inline country flag, device icon & dossier (i)</Text>
                                        </View>
                                        <Switch
                                            value={settings.isXLocationEnabled !== false}
                                            onValueChange={(v) => updateSettingKey('isXLocationEnabled', v)}
                                            trackColor={{ false: '#2f3336', true: '#1d9bf0' }}
                                        />
                                    </View>

                                    <View style={styles.toggleRow}>
                                        <View style={styles.toggleTextCol}>
                                            <Text style={styles.toggleLabel}>Stealth Ad Blocking</Text>
                                            <Text style={styles.toggleHint}>Collapse Promoted / Ad posts without breaking scroll</Text>
                                        </View>
                                        <Switch
                                            value={settings.isXHideAdsEnabled !== false}
                                            onValueChange={(v) => updateSettingKey('isXHideAdsEnabled', v)}
                                            trackColor={{ false: '#2f3336', true: '#1d9bf0' }}
                                        />
                                    </View>
                                </View>

                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>Friends Sync & Pixel Notifications</Text>

                                    <View style={styles.toggleRow}>
                                        <View style={styles.toggleTextCol}>
                                            <Text style={styles.toggleLabel}>Friends Seen & Forced Timeline</Text>
                                            <Text style={styles.toggleHint}>Show ✓ badges, ⚡ Force button & Friends feed tab</Text>
                                        </View>
                                        <Switch
                                            value={settings.isXFriendsSyncEnabled !== false}
                                            onValueChange={(v) => updateSettingKey('isXFriendsSyncEnabled', v)}
                                            trackColor={{ false: '#2f3336', true: '#10b981' }}
                                        />
                                    </View>

                                    <View style={styles.toggleRow}>
                                        <View style={styles.toggleTextCol}>
                                            <Text style={styles.toggleLabel}>Pixel Push Notifications</Text>
                                            <Text style={styles.toggleHint}>Notify for friend Forced posts (⚡), invites, and regular X notifications & DMs</Text>
                                        </View>
                                        <Switch
                                            value={settings.isXNotificationsEnabled !== false}
                                            onValueChange={(v) => updateSettingKey('isXNotificationsEnabled', v)}
                                            trackColor={{ false: '#2f3336', true: '#f59e0b' }}
                                        />
                                    </View>

                                    <View style={styles.cacheFooterRow}>
                                        <Text style={styles.toggleHint}>
                                            Verify Android Notification Center delivery
                                        </Text>
                                        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSendTestNotification}>
                                            <Text style={styles.secondaryBtnText}>🔔 Send Test Notification</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.card}>
                                    <Text style={styles.cardTitle}>Video Playback & Cache</Text>

                                    <View style={styles.toggleRow}>
                                        <View style={styles.toggleTextCol}>
                                            <Text style={styles.toggleLabel}>Start Videos Muted</Text>
                                            <Text style={styles.toggleHint}>Prevent auto-playing videos from playing sound immediately</Text>
                                        </View>
                                        <Switch
                                            value={Boolean(settings.isXAlwaysMuteEnabled)}
                                            onValueChange={(v) => updateSettingKey('isXAlwaysMuteEnabled', v)}
                                            trackColor={{ false: '#2f3336', true: '#1d9bf0' }}
                                        />
                                    </View>

                                    <View style={styles.volumeRow}>
                                        <Text style={styles.toggleLabel}>Default Video Volume: {currentVolumePct}%</Text>
                                        <View style={styles.volumePresets}>
                                            {[25, 50, 75, 100].map(pct => (
                                                <TouchableOpacity
                                                    key={pct}
                                                    style={[
                                                        styles.volPresetBtn,
                                                        currentVolumePct === pct && styles.volPresetBtnActive
                                                    ]}
                                                    onPress={() => updateSettingKey('xVolumeLevel', pct / 100)}
                                                >
                                                    <Text style={styles.volPresetText}>{pct}%</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.cacheFooterRow}>
                                        <Text style={styles.toggleHint}>
                                            Cached Account Locations: {cacheStats.totalCached || 0}
                                        </Text>
                                        <TouchableOpacity style={styles.secondaryBtn} onPress={handleClearLocationCache}>
                                            <Text style={styles.secondaryBtnText}>Clear Cache</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.68)',
        justifyContent: 'flex-end'
    },
    sheet: {
        height: '86%',
        backgroundColor: '#000000',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderTopWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
        paddingTop: 10
    },
    handleBar: {
        width: 42,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        alignSelf: 'center',
        marginBottom: 10
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.1)'
    },
    brandRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    brandBadge: {
        backgroundColor: 'rgba(29, 155, 240, 0.18)',
        borderWidth: 1,
        borderColor: '#1d9bf0',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3
    },
    brandBadgeText: {
        color: '#1d9bf0',
        fontWeight: '800',
        fontSize: 13
    },
    headerTitle: {
        color: '#e7e9ea',
        fontSize: 17,
        fontWeight: '800'
    },
    closeBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: 'rgba(255, 255, 255, 0.08)'
    },
    closeBtnText: {
        color: '#e7e9ea',
        fontWeight: '700',
        fontSize: 13.5
    },
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)'
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: '#0f1419',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)'
    },
    tabBtnActive: {
        backgroundColor: 'rgba(29, 155, 240, 0.18)',
        borderColor: '#1d9bf0'
    },
    tabBtnText: {
        color: '#71767b',
        fontWeight: '700',
        fontSize: 13
    },
    tabBtnTextActive: {
        color: '#1d9bf0'
    },
    bodyScroll: {
        flex: 1
    },
    bodyContent: {
        padding: 14,
        paddingBottom: 40,
        gap: 14
    },
    card: {
        backgroundColor: '#0f1419',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 12
    },
    cardHeaderBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8
    },
    cardTitle: {
        color: '#e7e9ea',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 4
    },
    cardSubtitle: {
        color: '#71767b',
        fontSize: 12.5,
        lineHeight: 17,
        marginBottom: 10
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4
    },
    textInput: {
        flex: 1,
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.16)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        color: '#e7e9ea',
        fontSize: 14
    },
    primaryBtn: {
        backgroundColor: '#1d9bf0',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10
    },
    primaryBtnText: {
        color: '#ffffff',
        fontWeight: '800',
        fontSize: 13.5
    },
    secondaryBtn: {
        backgroundColor: 'rgba(29, 155, 240, 0.14)',
        borderWidth: 1,
        borderColor: 'rgba(29, 155, 240, 0.45)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999
    },
    secondaryBtnText: {
        color: '#1d9bf0',
        fontWeight: '700',
        fontSize: 12.5
    },
    selfSyncBadgeRow: {
        marginTop: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.35)'
    },
    selfSyncBadgeText: {
        color: '#34d399',
        fontSize: 12,
        fontWeight: '700'
    },
    statusMsg: {
        marginTop: 8,
        fontSize: 12.5,
        fontWeight: '600'
    },
    statusOk: {
        color: '#10b981'
    },
    statusError: {
        color: '#ef4444'
    },
    inviteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(245, 158, 11, 0.14)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.45)',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginTop: 6
    },
    inviteEmail: {
        color: '#fcd34d',
        fontWeight: '700',
        fontSize: 13.5
    },
    rowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    acceptBtn: {
        backgroundColor: '#10b981',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 8
    },
    acceptBtnText: {
        color: '#000000',
        fontWeight: '800',
        fontSize: 12.5
    },
    removeSmallBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.18)',
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 8
    },
    removeSmallBtnText: {
        color: '#ef4444',
        fontWeight: '800',
        fontSize: 12.5
    },
    friendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)'
    },
    friendName: {
        color: '#e7e9ea',
        fontWeight: '700',
        fontSize: 14
    },
    friendMeta: {
        color: '#71767b',
        fontSize: 12,
        marginTop: 2
    },
    suggestionsScroll: {
        marginTop: 10
    },
    suggestionsContent: {
        gap: 6
    },
    suggestionPill: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginRight: 6
    },
    suggestionText: {
        color: '#e7e9ea',
        fontSize: 12.5
    },
    chipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 10
    },
    blockedChip: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.5)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4
    },
    blockedChipText: {
        color: '#fca5a5',
        fontSize: 12.5,
        fontWeight: '700'
    },
    emptyHint: {
        color: '#71767b',
        fontSize: 12.5,
        fontStyle: 'italic'
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)'
    },
    toggleTextCol: {
        flex: 1,
        paddingRight: 12
    },
    toggleLabel: {
        color: '#e7e9ea',
        fontSize: 14,
        fontWeight: '700'
    },
    toggleHint: {
        color: '#71767b',
        fontSize: 12,
        marginTop: 2
    },
    volumeRow: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)'
    },
    volumePresets: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8
    },
    volPresetBtn: {
        flex: 1,
        paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
        alignItems: 'center'
    },
    volPresetBtnActive: {
        backgroundColor: 'rgba(29, 155, 240, 0.2)',
        borderColor: '#1d9bf0'
    },
    volPresetText: {
        color: '#e7e9ea',
        fontWeight: '700',
        fontSize: 13
    },
    cacheFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 10
    }
});
