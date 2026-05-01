import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image, Platform, Modal, Pressable, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../../contexts/AuthContext';
import api, { getToken } from '../../utils/api';
import { BACKEND_URL } from '../../utils/config';

interface Thread {
  id: string;
  procedure_id: string;
  patient_name_display: string;
  shared_by_display?: string;
  shared_by_role?: string;
  shared_by_id?: string;
  shared_at?: string;
  status: 'open' | 'closed' | 'removed';
  close_reason?: string;
  close_note?: string;
  closed_by_name?: string;
  student_name?: string;
  supervisor_name?: string;
  implant_procedure_type?: string;
  case_status?: string;
  tags: string[];
  bookmarked?: boolean;
  watching?: boolean;
  anonymous: boolean;
  reply_count: number;
}

interface Post {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  attachments: { url: string; filename: string; type: string; size: number }[];
  created_at: string;
  edited_at?: string;
  deleted_at?: string;
  verified_by_id?: string;
  verified_by_name?: string;
  verified_at?: string;
  reactions_summary: Record<string, number>;
  reactions_mine: Record<string, boolean>;
  mentions: string[];
}

const REACTIONS: { key: string; icon: string; label: string }[] = [
  { key: 'thumbs', icon: '👍', label: 'thumbs-up' },
  { key: 'heart', icon: '❤️', label: 'heart' },
  { key: 'think', icon: '🤔', label: 'think' },
  { key: 'check', icon: '✅', label: 'verified' },
];

const CLOSE_REASONS = [
  { key: 'resolved', label: 'Resolved — answer verified' },
  { key: 'off_topic', label: 'Off-topic' },
  { key: 'privacy', label: 'Patient privacy concern' },
  { key: 'other', label: 'Other' },
];

async function getForumFileUrl(url: string): Promise<string> {
  const token = await getToken('access_token');
  // url is like /api/uploads/forum/<filename>
  return `${BACKEND_URL}${url}${token ? `?token=${token}` : ''}`;
}

export default function ForumThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { user } = useAuth();
  const [thread, setThread] = useState<Thread | null>(null);
  const [procedure, setProcedure] = useState<any>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [canRemove, setCanRemove] = useState(false);
  const [canVerify, setCanVerify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<{ url: string; filename: string; type: string; size: number }[]>([]);
  const [sending, setSending] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('resolved');
  const [closeNote, setCloseNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attachPreviewUrls, setAttachPreviewUrls] = useState<Record<string, string>>({});
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // Guard against the iOS "Different document picking in progress" error when
  // the previous picker hasn't fully released native state. Set true while a
  // picker (camera / library / document) is active, cleared in finally.
  const pickingInProgressRef = useRef(false);
  // Jump-to-bottom pill state ─ tracks unread replies that arrived while the
  // user was scrolled up from the bottom of the thread.
  const scrollRef = useRef<ScrollView | null>(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const prevPostCountRef = useRef(0);
  const isAtBottomRef = useRef(true);

  // Auto-scroll on first load + auto-follow when user is at bottom.
  // When user scrolled up and a new post arrives, increment the pill count.
  useEffect(() => {
    const prev = prevPostCountRef.current;
    if (posts.length > prev) {
      if (isAtBottomRef.current) {
        // User is reading at the bottom — keep them there.
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      } else {
        // User scrolled up — show pill with delta count
        setNewPostsCount(c => c + (posts.length - prev));
      }
    }
    prevPostCountRef.current = posts.length;
  }, [posts.length]);

  // ── Attachment helpers ─────────────────────────────────────────
  /**
   * Resize images to max 1600 px on the longer side and re-encode at 80 % JPEG.
   * A 4-megapixel iPhone photo (~3-4 MB) compresses to ~400-700 KB — about
   * 5× smaller, which makes threads load faster and keeps attachments well
   * under the 10 MB upload cap. Non-image files are returned unchanged.
   */
  const compressImageIfPossible = async (uri: string): Promise<{ uri: string; size?: number }> => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return { uri: result.uri };
    } catch (e) {
      // Manipulator may fail on web for some formats; fall back to original.
      console.warn('[forum] image compression skipped:', e);
      return { uri };
    }
  };

  const uploadAsset = async (asset: { uri: string; name: string; mimeType?: string; size?: number }) => {
    if ((asset.size || 0) > 10 * 1024 * 1024) {
      Alert.alert('Too large', 'Attachment must be 10 MB or smaller.');
      return;
    }
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(asset.uri).then(r => r.blob());
      form.append('file', blob, asset.name || 'file');
    } else {
      form.append('file', { uri: asset.uri, name: asset.name || 'file', type: asset.mimeType || 'application/octet-stream' } as any);
    }
    const up = await api.post('/forum/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    setAttachments(prev => [...prev, up.data]);
  };

  // Attachment sheet must close BEFORE launching the OS picker — iOS only
  // allows one modal at a time, and our Modal sitting on top would silently
  // prevent the system picker from appearing. 300 ms matches the Modal's
  // fade animation so the close feels seamless.
  const waitForSheetClose = () => new Promise<void>(resolve => setTimeout(resolve, 500));

  const pickFromCamera = async () => {
    if (pickingInProgressRef.current) {
      Alert.alert('Please wait', 'A previous file picker is still finishing. Try again in a moment.');
      return;
    }
    pickingInProgressRef.current = true;
    setShowAttachSheet(false);
    await waitForSheetClose();
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera permission needed', 'Enable camera access to capture clinical photos.');
          return;
        }
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a) return;
      setAttaching(true);
      const filename = a.fileName || `photo_${Date.now()}.jpg`;
      const compressed = await compressImageIfPossible(a.uri);
      await uploadAsset({ uri: compressed.uri, name: filename, mimeType: 'image/jpeg', size: a.fileSize });
    } catch (e: any) {
      console.error('[forum] camera pick failed:', e);
      Alert.alert('Camera failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setAttaching(false);
      pickingInProgressRef.current = false;
    }
  };

  const pickFromLibrary = async () => {
    if (pickingInProgressRef.current) {
      Alert.alert('Please wait', 'A previous file picker is still finishing. Try again in a moment.');
      return;
    }
    pickingInProgressRef.current = true;
    setShowAttachSheet(false);
    await waitForSheetClose();
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Enable photo library access to attach images.');
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a) return;
      setAttaching(true);
      const filename = a.fileName || `image_${Date.now()}.jpg`;
      const compressed = await compressImageIfPossible(a.uri);
      await uploadAsset({ uri: compressed.uri, name: filename, mimeType: 'image/jpeg', size: a.fileSize });
    } catch (e: any) {
      console.error('[forum] library pick failed:', e);
      Alert.alert('Library access failed', e?.response?.data?.detail || e?.message || 'Unknown error');
    } finally {
      setAttaching(false);
      pickingInProgressRef.current = false;
    }
  };

  const pickFromFiles = async () => {
    if (pickingInProgressRef.current) {
      Alert.alert('Please wait', 'A previous file picker is still finishing. Try again in a moment.');
      return;
    }
    pickingInProgressRef.current = true;
    setShowAttachSheet(false);
    await waitForSheetClose();
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a) return;
      setAttaching(true);
      const isImage = (a.mimeType || '').startsWith('image/');
      const uri = isImage ? (await compressImageIfPossible(a.uri)).uri : a.uri;
      const name = isImage ? (a.name || `image_${Date.now()}.jpg`) : (a.name || 'file');
      const mime = isImage ? 'image/jpeg' : a.mimeType;
      await uploadAsset({ uri, name, mimeType: mime, size: a.size });
    } catch (e: any) {
      console.error('[forum] document pick failed:', e);
      // Native iOS sometimes returns "Different document picking in progress"
      // even after the previous picker has dismissed. Surface a friendlier
      // message so the user knows a retry will succeed.
      const raw = e?.message || '';
      const friendly = raw.includes('Different document picking')
        ? 'A previous picker is still releasing. Please tap again in a moment.'
        : (e?.response?.data?.detail || raw || 'Unknown error');
      Alert.alert('File pick failed', friendly);
    } finally {
      setAttaching(false);
      pickingInProgressRef.current = false;
    }
  };

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const res = await api.get(`/forum/threads/${threadId}`);
      setThread(res.data?.thread);
      setProcedure(res.data?.procedure || null);
      setCanModerate(!!res.data?.can_moderate);
      setCanRemove(!!res.data?.can_remove);
      setCanVerify(!!res.data?.can_verify);
      const pr = await api.get(`/forum/threads/${threadId}/posts`, { params: { limit: 100 } });
      setPosts(pr.data?.items || []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load discussion.');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    // Build signed preview URLs for attachments
    (async () => {
      const urls: Record<string, string> = {};
      for (const p of posts) {
        for (const a of p.attachments || []) {
          if (!urls[a.url]) urls[a.url] = await getForumFileUrl(a.url);
        }
      }
      setAttachPreviewUrls(urls);
    })();
  }, [posts]);

  const pickAttachment = () => setShowAttachSheet(true);

  const submitPost = async () => {
    const body = composer.trim();
    if (!body && attachments.length === 0) return;
    setSending(true);
    try {
      await api.post(`/forum/threads/${threadId}/posts`, { body: body || ' ', attachments });
      setComposer('');
      setAttachments([]);
      await load();
    } catch (e: any) {
      Alert.alert('Could not post reply', e?.response?.data?.detail || 'Unknown error');
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (postId: string, reaction: string) => {
    try {
      const res = await api.post(`/forum/posts/${postId}/reactions`, { reaction });
      setPosts(prev => prev.map(p => (p.id === postId ? { ...p, reactions_summary: res.data.reactions_summary, reactions_mine: res.data.reactions_mine } : p)));
    } catch (e: any) {
      Alert.alert('Reaction failed', e?.response?.data?.detail || 'Unknown error');
    }
  };

  const toggleVerify = async (post: Post) => {
    try {
      if (post.verified_by_id) {
        await api.delete(`/forum/posts/${post.id}/verify`);
      } else {
        await api.post(`/forum/posts/${post.id}/verify`);
      }
      await load();
    } catch (e: any) {
      Alert.alert('Verification failed', e?.response?.data?.detail || 'Unknown error');
    }
  };

  const deletePost = async (post: Post) => {
    Alert.alert('Delete post?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/forum/posts/${post.id}`); await load(); }
        catch (e: any) { Alert.alert('Delete failed', e?.response?.data?.detail || 'Unknown error'); }
      } },
    ]);
  };

  const closeThread = async () => {
    try {
      await api.post(`/forum/threads/${threadId}/close`, { reason: closeReason, note: closeNote });
      setShowClose(false);
      await load();
    } catch (e: any) {
      Alert.alert('Close failed', e?.response?.data?.detail || 'Unknown error');
    }
  };

  const reopenThread = async () => {
    try { await api.post(`/forum/threads/${threadId}/reopen`); await load(); }
    catch (e: any) { Alert.alert('Reopen failed', e?.response?.data?.detail || 'Unknown error'); }
  };

  const removeThread = async () => {
    Alert.alert('Remove case from forum?', 'This hides the thread from all users except moderators.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.delete(`/forum/threads/${threadId}`); router.back(); }
        catch (e: any) { Alert.alert('Remove failed', e?.response?.data?.detail || 'Unknown error'); }
      } },
    ]);
  };

  const toggleBookmark = async () => {
    try {
      const res = await api.post(`/forum/threads/${threadId}/bookmark`);
      setThread(t => t ? { ...t, bookmarked: !!res.data?.bookmarked } : t);
    } catch {}
  };

  if (loading) {
    return <SafeAreaView style={s.screen}><ActivityIndicator size="large" color="#1565C0" style={{ marginTop: 40 }} /></SafeAreaView>;
  }
  if (error || !thread) {
    return <SafeAreaView style={s.screen}><View style={s.empty}><Ionicons name="warning-outline" size={40} color="#D32F2F" /><Text style={s.errorTxt}>{error || 'Thread not found'}</Text></View></SafeAreaView>;
  }

  const isOpen = thread.status === 'open';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={24} color="#37474F" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{thread.patient_name_display}</Text>
        <TouchableOpacity onPress={toggleBookmark} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} data-testid="forum-bookmark-btn">
          <Ionicons name={thread.bookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={thread.bookmarked ? '#F9A825' : '#37474F'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const atBottom = distanceFromBottom < 80;
          isAtBottomRef.current = atBottom;
          if (atBottom && newPostsCount > 0) setNewPostsCount(0);
        }}
        scrollEventThrottle={120}
      >
        {/* Case Summary */}
        <View style={s.summaryCard}>
          <View style={s.summaryHeader}>
            <Ionicons name="medical" size={16} color="#1565C0" />
            <Text style={s.summaryTitle}>Case Summary</Text>
          </View>
          {thread.implant_procedure_type && <Text style={s.summaryKV}><Text style={s.k}>Procedure: </Text>{thread.implant_procedure_type}</Text>}
          {thread.student_name && <Text style={s.summaryKV}><Text style={s.k}>Student: </Text>{thread.student_name}</Text>}
          {thread.supervisor_name && <Text style={s.summaryKV}><Text style={s.k}>Supervisor: </Text>{thread.supervisor_name}</Text>}
          {procedure?.missing_teeth?.length > 0 && <Text style={s.summaryKV}><Text style={s.k}>Missing teeth: </Text>{procedure.missing_teeth.join(', ')}</Text>}
          {procedure?.arch && <Text style={s.summaryKV}><Text style={s.k}>Arch: </Text>{procedure.arch}</Text>}
          <View style={s.tagsRow}>
            {thread.tags.map(t => <View key={t} style={s.tag}><Text style={s.tagTxt}>{t}</Text></View>)}
          </View>
          <View style={s.summaryActionsRow}>
            <TouchableOpacity style={s.summaryBtn} onPress={() => router.push(`/procedures/${thread.procedure_id}` as any)} data-testid="forum-open-case-btn">
              <Ionicons name="document-text" size={14} color="#1565C0" />
              <Text style={s.summaryBtnTxt}>Open Full Case Report</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.sharedBy}>Shared by {thread.shared_by_display || 'Unknown'} • {thread.shared_by_role}</Text>
        </View>

        {thread.status === 'closed' && (
          <View style={s.closedBanner}>
            <Ionicons name="lock-closed" size={16} color="#E65100" />
            <Text style={s.closedTxt}>
              Discussion closed by {thread.closed_by_name || 'moderator'}
              {thread.close_reason ? ` — ${CLOSE_REASONS.find(r => r.key === thread.close_reason)?.label || thread.close_reason}` : ''}
              {thread.close_note ? `: ${thread.close_note}` : ''}
            </Text>
          </View>
        )}
        {thread.status === 'removed' && (
          <View style={[s.closedBanner, { backgroundColor: '#FFEBEE' }]}>
            <Ionicons name="trash" size={16} color="#B71C1C" />
            <Text style={[s.closedTxt, { color: '#B71C1C' }]}>This thread has been removed. Only moderators can see it.</Text>
          </View>
        )}

        {/* Mod actions */}
        {(canModerate || canRemove) && (
          <View style={s.modRow}>
            {canModerate && isOpen && (
              <TouchableOpacity style={[s.modBtn, { backgroundColor: '#FFF3E0' }]} onPress={() => setShowClose(true)} data-testid="forum-close-btn">
                <Ionicons name="lock-closed-outline" size={14} color="#E65100" />
                <Text style={[s.modBtnTxt, { color: '#E65100' }]}>Close Discussion</Text>
              </TouchableOpacity>
            )}
            {canRemove && !isOpen && thread.status === 'closed' && (
              <TouchableOpacity style={[s.modBtn, { backgroundColor: '#E8F5E9' }]} onPress={reopenThread} data-testid="forum-reopen-btn">
                <Ionicons name="lock-open-outline" size={14} color="#2E7D32" />
                <Text style={[s.modBtnTxt, { color: '#2E7D32' }]}>Reopen</Text>
              </TouchableOpacity>
            )}
            {canRemove && thread.status !== 'removed' && (
              <TouchableOpacity style={[s.modBtn, { backgroundColor: '#FFEBEE' }]} onPress={removeThread} data-testid="forum-remove-btn">
                <Ionicons name="trash-outline" size={14} color="#C62828" />
                <Text style={[s.modBtnTxt, { color: '#C62828' }]}>Remove from Forum</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Posts */}
        <View style={{ padding: 14 }}>
          {posts.length === 0 ? (
            <Text style={s.noReplies}>No replies yet. Be the first to contribute.</Text>
          ) : posts.map(p => (
            <View key={p.id} style={[s.post, p.verified_by_id && s.postVerified]}>
              {p.verified_by_id && (
                <View style={s.verifiedBanner}>
                  <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
                  <Text style={s.verifiedTxt}>Verified Answer — by {p.verified_by_name}</Text>
                </View>
              )}
              <View style={s.postHeader}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{(p.author_name || '?')[0]?.toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.authorName}>{p.author_name}</Text>
                  <Text style={s.authorRole}>{p.author_role} • {new Date(p.created_at).toLocaleString()}{p.edited_at ? ' (edited)' : ''}</Text>
                </View>
                {(p.author_id === user?.id || canRemove) && !p.deleted_at && (
                  <TouchableOpacity onPress={() => deletePost(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={16} color="#78909C" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[s.postBody, p.deleted_at && s.postDeleted]}>{p.body}</Text>
              {(p.attachments || []).map((a, idx) => (
                <View key={idx} style={s.attachment}>
                  {a.type === 'image' ? (
                    <Image source={{ uri: attachPreviewUrls[a.url] || '' }} style={s.attachmentImg} resizeMode="contain" />
                  ) : (
                    <TouchableOpacity style={s.pdfAttach} onPress={() => {
                      const url = attachPreviewUrls[a.url];
                      if (url && Platform.OS === 'web') window.open(url, '_blank');
                    }}>
                      <Ionicons name="document" size={20} color="#C62828" />
                      <Text style={s.pdfAttachTxt} numberOfLines={1}>{a.filename}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {!p.deleted_at && (
                <View style={s.reactionsRow}>
                  {REACTIONS.map(r => {
                    const count = p.reactions_summary[r.key] || 0;
                    const mine = !!p.reactions_mine[r.key];
                    return (
                      <TouchableOpacity key={r.key} onPress={() => toggleReaction(p.id, r.key)} style={[s.reactChip, mine && s.reactChipOn]} data-testid={`reaction-${r.key}-${p.id}`}>
                        <Text style={s.reactIcon}>{r.icon}</Text>
                        {count > 0 && <Text style={[s.reactCount, mine && { color: '#1565C0' }]}>{count}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                  {canVerify && (
                    <TouchableOpacity onPress={() => toggleVerify(p)} style={[s.verifyBtn, p.verified_by_id && s.verifyBtnOn]} data-testid={`verify-${p.id}`}>
                      <Ionicons name={p.verified_by_id ? 'checkmark-circle' : 'checkmark-circle-outline'} size={14} color={p.verified_by_id ? '#2E7D32' : '#78909C'} />
                      <Text style={[s.verifyBtnTxt, p.verified_by_id && { color: '#2E7D32' }]}>{p.verified_by_id ? 'Verified' : 'Verify'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Jump-to-bottom pill — shown when user has scrolled up & new replies arrived */}
      {newPostsCount > 0 && (
        <TouchableOpacity
          style={s.jumpPill}
          onPress={() => {
            scrollRef.current?.scrollToEnd({ animated: true });
            setNewPostsCount(0);
          }}
          data-testid="forum-jump-to-bottom-btn"
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-down" size={14} color="#FFF" />
          <Text style={s.jumpPillTxt}>{newPostsCount} new {newPostsCount === 1 ? 'reply' : 'replies'}</Text>
        </TouchableOpacity>
      )}

      {/* Composer */}
      {isOpen && user?.role !== 'nurse' && (
        <View style={s.composer}>
          {(attachments.length > 0 || attaching) && (
            <View style={s.attachedRow}>
              {attachments.map((a, idx) => (
                <View key={idx} style={s.attachedChip}>
                  <Ionicons name={a.type === 'pdf' ? 'document' : 'image'} size={12} color="#1565C0" />
                  <Text style={s.attachedTxt} numberOfLines={1}>{a.filename}</Text>
                  <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}>
                    <Ionicons name="close" size={14} color="#90A4AE" />
                  </TouchableOpacity>
                </View>
              ))}
              {attaching && (
                <View style={[s.attachedChip, { backgroundColor: '#FFF8E1', borderColor: '#FFE082', borderWidth: 1 }]} data-testid="forum-attaching-spinner">
                  <ActivityIndicator size="small" color="#FF8F00" />
                  <Text style={[s.attachedTxt, { color: '#E65100', fontStyle: 'italic' }]}>Attaching…</Text>
                </View>
              )}
            </View>
          )}
          <View style={s.composerRow}>
            <TouchableOpacity onPress={pickAttachment} disabled={attaching} style={[s.attachBtn, attaching && { opacity: 0.4 }]} data-testid="forum-attach-btn">
              <Ionicons name="attach" size={22} color="#1565C0" />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder="Share your thoughts... use @name to mention"
              value={composer}
              onChangeText={setComposer}
              multiline
              data-testid="forum-reply-input"
            />
            <TouchableOpacity onPress={submitPost} disabled={sending || (!composer.trim() && attachments.length === 0)} style={[s.sendBtn, (sending || (!composer.trim() && attachments.length === 0)) && { opacity: 0.4 }]} data-testid="forum-reply-send-btn">
              {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Close-reason modal */}
      <Modal visible={showClose} transparent animationType="fade" onRequestClose={() => setShowClose(false)}>
        <Pressable style={s.overlay} onPress={() => setShowClose(false)}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Close Discussion</Text>
              <Text style={s.modalSub}>Choose a reason:</Text>
              {CLOSE_REASONS.map(r => (
                <TouchableOpacity key={r.key} style={[s.reasonRow, closeReason === r.key && s.reasonRowOn]} onPress={() => setCloseReason(r.key)}>
                  <View style={[s.radio, closeReason === r.key && s.radioOn]}>
                    {closeReason === r.key && <View style={s.radioDot} />}
                  </View>
                  <Text style={s.reasonTxt}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={s.closeNoteInput}
                placeholder="Optional note (visible to participants)"
                placeholderTextColor="#90A4AE"
                value={closeNote}
                onChangeText={setCloseNote}
                multiline
              />
              <View style={s.modalActionsRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowClose(false)}>
                  <Text style={s.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.confirmCloseBtn} onPress={closeThread} data-testid="forum-close-confirm-btn">
                  <Text style={s.confirmCloseTxt}>Close Discussion</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Attachment-source action sheet */}
      <Modal visible={showAttachSheet} transparent animationType="fade" onRequestClose={() => setShowAttachSheet(false)}>
        <Pressable style={s.overlay} onPress={() => setShowAttachSheet(false)}>
          <Pressable style={s.sheetCard} onPress={(e) => e.stopPropagation()}>
            <Text style={s.sheetTitle}>Attach to your reply</Text>
            <Text style={s.sheetSub}>Max 10 MB per file. Images and PDFs only.</Text>
            <TouchableOpacity style={s.sheetOption} onPress={pickFromCamera} data-testid="attach-camera-btn">
              <View style={[s.sheetIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="camera" size={22} color="#1565C0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetLabel}>Take Photo</Text>
                <Text style={s.sheetHelp}>Use your camera (e.g. clinical photograph)</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetOption} onPress={pickFromLibrary} data-testid="attach-library-btn">
              <View style={[s.sheetIcon, { backgroundColor: '#F3E5F5' }]}>
                <Ionicons name="images" size={22} color="#7B1FA2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetLabel}>Photo Library</Text>
                <Text style={s.sheetHelp}>Choose an image from your gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetOption} onPress={pickFromFiles} data-testid="attach-files-btn">
              <View style={[s.sheetIcon, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="document-attach" size={22} color="#E65100" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetLabel}>PDF or Document</Text>
                <Text style={s.sheetHelp}>Choose a PDF or image from Files / cloud storage</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#B0BEC5" />
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetCancel} onPress={() => setShowAttachSheet(false)}>
              <Text style={s.sheetCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1', gap: 12 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#37474F' },
  summaryCard: { backgroundColor: '#FFF', margin: 14, marginBottom: 0, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: '#1565C0' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: '#1565C0', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryKV: { fontSize: 13, color: '#37474F', marginBottom: 4, lineHeight: 18 },
  k: { fontWeight: '700', color: '#546E7A' },
  sharedBy: { fontSize: 11, color: '#90A4AE', marginTop: 8, fontStyle: 'italic' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: { backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagTxt: { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  summaryActionsRow: { flexDirection: 'row', marginTop: 10, gap: 8 },
  summaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#E3F2FD' },
  summaryBtnTxt: { fontSize: 12, fontWeight: '600', color: '#1565C0' },
  closedBanner: { margin: 14, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  closedTxt: { flex: 1, fontSize: 13, color: '#E65100' },
  modRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 4, flexWrap: 'wrap' },
  modBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  modBtnTxt: { fontSize: 12, fontWeight: '600' },
  noReplies: { textAlign: 'center', fontSize: 13, color: '#90A4AE', paddingVertical: 20 },
  post: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#ECEFF1' },
  postVerified: { borderColor: '#A5D6A7', backgroundColor: '#F1F8E9' },
  verifiedBanner: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#C8E6C9' },
  verifiedTxt: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  authorName: { fontSize: 14, fontWeight: '700', color: '#37474F' },
  authorRole: { fontSize: 11, color: '#78909C' },
  postBody: { fontSize: 14, color: '#37474F', lineHeight: 20, marginBottom: 6 },
  postDeleted: { fontStyle: 'italic', color: '#90A4AE' },
  attachment: { marginTop: 6, marginBottom: 2 },
  attachmentImg: { width: '100%', maxWidth: 320, height: 200, borderRadius: 8, backgroundColor: '#ECEFF1' },
  pdfAttach: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
  pdfAttachTxt: { fontSize: 12, color: '#C62828', fontWeight: '600', maxWidth: 220 },
  reactionsRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  reactChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, backgroundColor: '#F5F5F5' },
  reactChipOn: { backgroundColor: '#E3F2FD' },
  reactIcon: { fontSize: 14 },
  reactCount: { fontSize: 11, fontWeight: '600', color: '#546E7A' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, backgroundColor: '#F5F5F5' },
  verifyBtnOn: { backgroundColor: '#C8E6C9' },
  verifyBtnTxt: { fontSize: 11, fontWeight: '700', color: '#78909C' },
  composer: { backgroundColor: '#FFF', padding: 10, borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  jumpPill: { position: 'absolute', alignSelf: 'center', bottom: 110, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1565C0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 4, zIndex: 50 },
  jumpPillTxt: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  attachedRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  attachedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, maxWidth: 200 },
  attachedTxt: { fontSize: 11, color: '#1565C0', flex: 1 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  input: { flex: 1, maxHeight: 100, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F5F7FA', borderRadius: 20, fontSize: 14, color: '#37474F', outlineWidth: 0 as any },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorTxt: { fontSize: 14, color: '#C62828', marginTop: 10, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 20, width: '100%', maxWidth: 440, maxHeight: '85%' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#37474F', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#78909C', marginBottom: 14 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, marginBottom: 6 },
  reasonRowOn: { backgroundColor: '#E3F2FD' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#90A4AE', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: '#1565C0' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1565C0' },
  reasonTxt: { fontSize: 13, color: '#37474F', flex: 1 },
  closeNoteInput: { borderWidth: 1, borderColor: '#CFD8DC', marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, minHeight: 60, fontSize: 14, color: '#37474F', backgroundColor: '#FAFAFA', textAlignVertical: 'top' },
  modalActionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', alignItems: 'center' },
  cancelTxt: { fontSize: 14, fontWeight: '600', color: '#546E7A' },
  confirmCloseBtn: { flex: 1.4, paddingVertical: 12, borderRadius: 8, backgroundColor: '#E65100', alignItems: 'center' },
  confirmCloseTxt: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  // ── Attachment action sheet ─────────────────────────────────
  sheetCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, width: '100%', maxWidth: 440 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#37474F' },
  sheetSub: { fontSize: 12, color: '#90A4AE', marginBottom: 14, marginTop: 2 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  sheetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sheetLabel: { fontSize: 14, fontWeight: '700', color: '#37474F' },
  sheetHelp: { fontSize: 12, color: '#78909C', marginTop: 2 },
  sheetCancel: { marginTop: 14, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CFD8DC', alignItems: 'center' },
  sheetCancelTxt: { fontSize: 14, fontWeight: '600', color: '#546E7A' },
});
