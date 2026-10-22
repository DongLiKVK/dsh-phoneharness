package com.lc.phoneharness;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.SpannableStringBuilder;
import android.text.TextUtils;
import android.text.Selection;
import android.text.style.BackgroundColorSpan;
import android.text.style.StyleSpan;
import android.text.style.TypefaceSpan;
import android.util.TypedValue;
import android.view.ActionMode;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.LayoutInflater;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.PopupWindow;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.HashSet;
import java.util.Locale;

/**
 * 聊天页。
 *
 * 形态对齐 DeepSeek 官方手机版：顶部只有返回 + 标题 + 状态；正文整宽排布，用户消息
 * 靠右浅灰气泡、助手消息不带气泡；底部是胶囊输入条（左「+」、中间输入、右圆形发送）。
 */
public class ChatActivity extends Activity {

    /** attach 阶段定下的语言：onResume 用它判断界面是否需要重建（与主题的 darkAtBuild 同一套做法）。 */
    private String langAtBuild;

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Langs.wrap(base));
        langAtBuild = Langs.current(base);
    }

    private static final int REQ_PICK = 4101;

    private Prefs prefs;
    private Api api;
    private Sse sse;
    private Theme t;
    /** 建界面时的明暗状态：设置页改外观后回到会话要整体重建。 */
    private boolean darkAtBuild;

    private String sessionId;
    private String title;

    private LinearLayout timeline;
    private ScrollView scroller;
    private TextView titleView;
    /** 会话标题旁的只读预设标签（无数据时整枚不显示）。 */
    private TextView presetTag;
    private TextView statusView;
    private LinearLayout noticeRow;
    private TextView noticeText;
    private LinearLayout questionRow;
    private EditText input;
    private FrameLayout stopButton;
    private LinearLayout attachStrip;

    /* ---------------- 历史抽屉：≡ 打开，原地切换会话（对齐官方 2.6.1） ---------------- */
    /** 抽屉根容器：带「左缘往右划」手势。 */
    private Root shell;
    private View drawerMask;
    private LinearLayout drawerPanel;
    private LinearLayout drawerList;
    private boolean drawerOpen;
    private int drawerWidth;
    /** 抽屉里的会话列表：与首页同一个 /v1/sessions 接口、同一份字段，只读。 */
    private final List<JSONObject> drawerSessions = new ArrayList<JSONObject>();
    private boolean drawerLoading;
    private String drawerError = "";

    /* 抽屉顶栏 / 底栏：形态与首页抽屉（MainActivity.drawerBody）逐栏对齐。 */
    /** 顶栏容器：常态是一枚搜索胶囊 + 工作区 chips，检索态换成输入框。 */
    private LinearLayout drawerHeadBox;
    private boolean drawerSearching;
    private EditText drawerSearchInput;
    private String drawerQuery = "";
    /**
     * 工作区筛选（空串 = 全部）。
     *
     * 只影响这个抽屉里显示哪些会话，不写回 Prefs —— 聊天页的筛选是「我现在想看哪个目录」，
     * 一旦写回就会把首页的默认工作区和新建会话的 cwd 一起改掉。
     */
    private String drawerWs = "";
    private final List<String> drawerWsCwds = new ArrayList<String>();
    private final List<String> drawerWsNames = new ArrayList<String>();
    /** 底栏「谁在用这台电脑」：头像 / 昵称 / 主机 · 设备 / ⋯。 */
    private LinearLayout drawerUserBox;
    private FrameLayout drawerUserAvatar;
    private TextView drawerUserLetter;
    private ImageView drawerUserPhoto;
    private TextView drawerUserName;

    /** 宿主默认模型 provider（deepseek-account 之类），从 /v1/catalog 取。 */

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final LinkedHashMap<String, Item> items = new LinkedHashMap<String, Item>();
    private final List<Pick.Pending> pending = new ArrayList<Pick.Pending>();
    private long since = -1L;
    private String status = "idle";
    /**
     * 首屏只画最近这么多条。
     *
     * 真实会话动辄 3400+ 条，全量建视图要几秒；官方也是往上翻才继续加载。
     */
    private static final int WINDOW = 60;
    /** 本地缓存最多留这么多条（够翻一阵，又不至于把磁盘塞满）。 */
    private static final int CACHE_ITEMS = 400;
    /** 从排序后的第几条开始画；-1 表示还没定，按窗口算。 */
    private int windowFrom = -1;
    /** 这次重绘后要不要滚到底（往上翻旧消息时不能滚）。 */
    private boolean scrollToEnd = true;
    /** 电脑上还有更早的消息没拉下来（服务端 tail 模式）。 */
    private boolean truncated;
    /** 上次拿到的 ETag：内容没变时服务端回 304，直接用缓存。 */
    private String cacheEtag = "";
    /**
     * SSE 每来一条 item 就整页重绘太贵（流式回复时每秒好几条）。
     * 合并成 120ms 一次，肉眼无感，CPU 掉一个量级。
     */
    private final Runnable renderSoon = new Runnable() {
        @Override
        public void run() {
            renderAll();
        }
    };
    private long lastSendAt;
    private int pictureWidth;
    private boolean expandedTools;

    /** 最后一条助手消息的 id：免责声明只挂在它下面。 */
    private String lastAssistantId = "";
    /** 思考块展开状态，按消息 id 记住（重绘后还在）。 */
    private final HashSet<String> expandedMarkers = new HashSet<String>();
    /** 折叠的思考区：按首项 id 记住展开状态，SSE 每来一条就整体重绘也不丢。 */
    private final HashSet<String> openGroups = new HashSet<String>();
    /** 操作条上可切换图标（赞 / 踩 / 朗读）的刷新器，按消息 id 存。 */
    private final LinkedHashMap<String, Runnable> barPainters = new LinkedHashMap<String, Runnable>();
    /** 最近一次长按的屏幕坐标（浮层定位用）。 */
    private int menuTouchX;
    private int menuTouchY;
    /** 赞过 / 踩过的消息 id。 */
    private final HashSet<String> likedIds = new HashSet<String>();
    private final HashSet<String> dislikedIds = new HashSet<String>();
    /** 已经从本机 prefs 回填过赞/踩状态的消息 id（同一条只读一次磁盘）。 */
    private final HashSet<String> feedbackRestored = new HashSet<String>();
    /** 锚定消息的长按浮层，同一时刻只留一个。 */
    private PopupWindow messageMenu;
    /** 朗读引擎：第一次点「朗读」才创建，离开界面就释放。 */
    private TextToSpeech tts;
    private boolean ttsReady;
    private boolean ttsBroken;
    private boolean ttsDestroyed;
    /** 引擎初始化看门狗：没装语音引擎时 onInit 可能永不回调，2 秒没就绪就按不可用处理。 */
    private final Runnable ttsWatchdog = new Runnable() {
        @Override
        public void run() {
            if (ttsDestroyed || ttsBroken || ttsReady) return;
            ttsBroken = true;
            releaseTts();
            toast(getString(R.string.ch_speak_no_engine));
        }
    };
    /** 正在朗读的消息 id，空串表示没在朗读。 */
    private String speakingId = "";

    /** 当前正在展示的反问：eventId + 问题数组 + 每题已选项。多题时累积后一次性提交。 */
    private String sheetEventId;
    private JSONArray sheetQuestions;
    private final List<List<String>> sheetPicks = new ArrayList<List<String>>();

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = new Prefs(this);
        api = new Api(prefs);
        t = Theme.of(this);
        darkAtBuild = t.dark;
        getWindow().setStatusBarColor(t.bg);
        getWindow().setNavigationBarColor(t.bg);
        getWindow().getDecorView().setSystemUiVisibility(
                t.dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        sessionId = getIntent().getStringExtra("sessionId");
        title = getIntent().getStringExtra("title");
        if (sessionId == null) {
            finish();
            return;
        }
        pictureWidth = Math.max(t.dp(180), getResources().getDisplayMetrics().widthPixels - t.dp(96));
        build();
        load();
        loadCatalog();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 语言在 attach 阶段定死：设置页改过语言后，回到本页要整体重建。
        if (Langs.changed(this, langAtBuild)) {
            recreate();
            return;
        }
        if (prefs != null && Theme.of(this).dark != darkAtBuild) {
            recreate();
        }
    }

    @Override
    public void onBackPressed() {
        // 选择面板开着时返回键先收面板（不让一次返回把整页带走）。
        if (selectSheet != null && selectSheet.open) {
            closeSelectSheet();
            return;
        }
        // 抽屉开着时返回键先收抽屉（不让一次返回把整页带走）。
        if (drawerOpen && drawerSearching) {
            // 检索态先退检索，再退抽屉：一次返回不要把整层抽屉带走。
            closeDrawerSearch();
            return;
        }
        if (drawerOpen) {
            closeDrawer();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 离开界面就收掉选择面板（切走再回来不该还挂着一块浮层）。
        closeSelectSheet();
        // 离开界面就别在后台继续念了，顺手把引擎放掉。
        stopSpeak();
        releaseTts();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(renderSoon);
        ttsDestroyed = true;
        closeSelectSheet();
        dismissMessageMenu();
        stopSpeak();
        releaseTts();
        if (sse != null) sse.stop();
        super.onDestroy();
    }

    /* ------------------------------------------------------------------ */
    /* 骨架                                                              */
    /* ------------------------------------------------------------------ */

    private void build() {
        LinearLayout root = t.column();
        root.setBackgroundColor(t.bg);

        root.addView(topBar());
        renderPresetTag();
        // 首帧没有可显示的预设名时，静默补一次主机状态（拿得到就把标签点亮）。
        if (presetTagLabel().length() == 0) {
            Harness.refresh(this, prefs, new Runnable() {
                @Override
                public void run() {
                    renderPresetTag();
                }
            });
        }

        noticeRow = t.row();
        noticeRow.setVisibility(View.GONE);
        noticeRow.setBackgroundColor(t.dark ? Theme.alpha(t.warn, 0.16f) : Theme.alpha(t.warn, 0.13f));
        noticeRow.setPadding(t.dp(16), t.dp(10), t.dp(12), t.dp(10));
        noticeText = t.text("", 12f, t.warn);
        noticeRow.addView(noticeText, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(noticeRow);

        questionRow = t.column();
        questionRow.setVisibility(View.GONE);
        root.addView(questionRow);

        scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setClipToPadding(false);
        scroller.setVerticalScrollBarEnabled(false);
        scroller.setOverScrollMode(View.OVER_SCROLL_NEVER);
        timeline = t.column();
        timeline.setPadding(t.dp(16), t.dp(8), t.dp(16), t.dp(16));
        scroller.addView(timeline);
        root.addView(scroller, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        attachStrip = t.row();
        attachStrip.setVisibility(View.GONE);
        attachStrip.setPadding(t.dp(14), t.dp(8), t.dp(14), 0);
        root.addView(attachStrip);

        root.addView(composer());

        // 官方对话页（2.6.1）：≡ 打开历史抽屉，当前会话留在原页 —— 不是退回首页的新对话页。
        drawerWidth = (int) (getResources().getDisplayMetrics().widthPixels * 0.82f);
        shell = new Root(this);
        shell.addView(root, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        drawerMask = new View(this);
        drawerMask.setBackgroundColor(0x99000000);
        drawerMask.setAlpha(0f);
        drawerMask.setVisibility(View.GONE);
        drawerMask.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                closeDrawer();
            }
        });
        shell.addView(drawerMask, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        drawerPanel = drawerBody();
        shell.addView(drawerPanel, new FrameLayout.LayoutParams(
                drawerWidth, FrameLayout.LayoutParams.MATCH_PARENT));
        drawerPanel.setTranslationX(-drawerWidth);
        drawerPanel.setVisibility(View.GONE);

        shell.setSwipe(new Root.Swipe() {
            @Override
            public void drag(float dx) {
                if (drawerOpen) return;
                float x = Math.min(0f, -drawerWidth + dx);
                if (x < -drawerWidth) x = -drawerWidth;
                drawerPanel.setTranslationX(x);
                drawerPanel.setVisibility(View.VISIBLE);
                drawerMask.setVisibility(View.VISIBLE);
                drawerMask.setAlpha(Math.min(1f, dx / drawerWidth) * 0.6f);
            }

            @Override
            public void release(float dx) {
                if (drawerOpen) return;
                if (dx > drawerWidth * 0.34f) openDrawer();
                else closeDrawer();
            }
        });

        setContentView(shell);
    }

    private View topBar() {
        LinearLayout bar = t.row();
        bar.setPadding(t.dp(6), t.dp(8), t.dp(8), t.dp(8));
        bar.setBackgroundColor(t.bg);

        /* 官方对话页顶栏：左 ≡（回历史抽屉）· 标题左对齐 · 右 朗读/新建/更多 */
        FrameLayout menu = t.iconButton(R.drawable.ic_menu, t.text, 20, 42);
        menu.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (drawerOpen) closeDrawer();
                else openDrawer();
            }
        });
        bar.addView(menu);

        LinearLayout titles = t.column();
        titles.setGravity(Gravity.START);
        titleView = t.strong(title == null || title.length() == 0 ? getString(R.string.ch_title_fallback) : title, 16f, t.text);
        titleView.setGravity(Gravity.START);
        titleView.setMaxLines(1);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        statusView = t.text("", 11f, t.muted);
        statusView.setGravity(Gravity.START);
        statusView.setVisibility(View.GONE);
        // 会话一旦开始，Agent 预设就固定了：这里只放一枚只读标签，不给任何切换控件
        // （桌面版同样拒绝这个承诺，见 docs/harness-desktop-reference.md）。
        presetTag = t.text("", 12f, t.muted);
        presetTag.setSingleLine(true);
        presetTag.setEllipsize(TextUtils.TruncateAt.END);
        presetTag.setGravity(Gravity.CENTER);
        presetTag.setMaxWidth(t.dp(180));
        presetTag.setPadding(t.dp(8), 0, t.dp(8), 0);
        presetTag.setBackground(t.round(t.dark ? t.surfaceAlt : Theme.alpha(t.text, 0.055f), 6f));
        presetTag.setClickable(false);
        presetTag.setVisibility(View.GONE);
        LinearLayout titleRow = t.row();
        titleRow.addView(titleView, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams tagLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(22));
        tagLp.leftMargin = t.dp(6);
        titleRow.addView(presetTag, tagLp);
        titles.addView(titleRow, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        titles.addView(statusView);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titleLp.leftMargin = t.dp(6);
        bar.addView(titles, titleLp);

        stopButton = t.iconButton(R.drawable.ic_interrupt, t.warn, 18, 40);
        stopButton.setVisibility(View.GONE);
        stopButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                interrupt();
            }
        });
        bar.addView(stopButton);

        FrameLayout speakTop = t.iconButton(R.drawable.ic_volume, t.text, 20, 40);
        speakTop.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Item last = lastAssistant();
                if (last == null) {
                    toast(getString(R.string.ch_speak_no_reply));
                    return;
                }
                toggleSpeak(new BarTarget(last));
            }
        });
        bar.addView(speakTop);

        FrameLayout fresh = t.iconButton(R.drawable.ic_new_chat, t.text, 21, 40);
        fresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                closeWithPop();
            }
        });
        bar.addView(fresh);

        FrameLayout more = t.iconButton(R.drawable.ic_more, t.text, 20, 40);
        more.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                sessionMenu();
            }
        });
        bar.addView(more);
        return bar;
    }

    /** 会话标题旁的只读预设标签：拿不到主机数据就整枚不显示（不留占位）。 */
    private void renderPresetTag() {
        if (presetTag == null) return;
        String label = presetTagLabel();
        if (label.length() == 0) {
            presetTag.setVisibility(View.GONE);
            return;
        }
        presetTag.setText(label);
        presetTag.setVisibility(View.VISIBLE);
    }

    /** 当前预设名：优先主机状态，退到 Prefs 快照，都没有就空串。 */
    private String presetTagLabel() {
        Harness.State state = Harness.state();
        String label = state != null ? state.presetTitle(state.agentPreset) : "";
        if (label == null || label.length() == 0) label = prefs.harnessPresetTitle();
        return label == null ? "" : label;
    }

    /** 最后一条助手消息（顶栏朗读用）。 */
    private Item lastAssistant() {
        Item found = null;
        for (Item item : items.values()) {
            if (!item.isUser() && !item.isTool() && item.body(this) != null && item.body(this).length() > 0) found = item;
        }
        return found;
    }

    /* ------------------------------------------------------------------ */
    /* 底部输入区（composer）：照官方 DeepSeek 2.6.1 实测几何重做            */
    /*  卡片 338dp 宽 · 圆角 28dp · 内边距 16/12/10/10 · 浅色白底 + #F0F0F0 */
    /*  第一行：输入框（语音模式换成居中的「按住说话」）                    */
    /*  第二行：深度思考 chip · 智能搜索 chip · 弹簧 · 上传键 · 动作键      */
    /*  上传面板：拍照 / 相册 / 文件 三个等高方块                           */
    /* ------------------------------------------------------------------ */

    private LinearLayout modelChip;
    private ImageView modelIcon;
    private TextView modelLabel;
    private ImageView modelArrow;
    private LinearLayout permChip;
    private ImageView permIcon;
    private TextView permLabel;
    private ImageView permArrow;
    private FrameLayout uploadButton;
    private ImageView uploadIcon;
    private LinearLayout uploadPanel;
    private FrameLayout actionButton;
    private ImageView actionIcon;
    private FrameLayout talkBox;
    private TextView voiceHint;
    private boolean voiceMode;
    private java.io.File shotFile;

    private static final int REQ_SHOT = 4103;
    private static final int REQ_ASR = 4104;
    private static final int REQ_FILE = 4105;

    private View composer() {
        LinearLayout wrap = t.column();
        wrap.setBackgroundColor(t.bg);
        wrap.setPadding(t.dp(11), t.dp(4), t.dp(11), t.dp(10));

        voiceHint = t.text(getString(R.string.composer_release_send), 12f, t.muted);
        voiceHint.setGravity(Gravity.CENTER);
        voiceHint.setBackground(t.round(t.surfaceAlt, 16f));
        voiceHint.setPadding(t.dp(16), t.dp(9), t.dp(16), t.dp(9));
        voiceHint.setVisibility(View.GONE);
        Theme.margin(voiceHint, 0, 0, 0, t.dp(8));
        wrap.addView(voiceHint);

        LinearLayout card = t.column();
        card.setBackground(t.roundStroke(t.cardFill, t.cardStroke, 28f));
        card.setPadding(t.dp(16), t.dp(12), t.dp(10), t.dp(10));

        FrameLayout first = new FrameLayout(this);
        first.setMinimumHeight(t.dp(24));
        first.addView(inputField(), new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        first.addView(talkField(), new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, t.dp(24)));
        card.addView(first);

        LinearLayout row = t.row();
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rowLp.topMargin = t.dp(7);
        card.addView(row, rowLp);

        // 契约 §3.1 v1.3.4：模型 / 权限两枚 chip 留在输入胶囊内的这一行（改动前的位置与交互），
        // 弹簧保证它们与两枚 44dp 圆钮一起贴右；会话页没有工作区 / 预设 chip，因此不再有座位带。
        modelChip = seatChip(R.drawable.ic_data, 70, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showModelMenu(ChatActivity.this, t, prefs, modelChip, new Runnable() {
                    @Override
                    public void run() {
                        renderChips();
                    }
                });
            }
        });
        modelIcon = (ImageView) modelChip.getChildAt(0);
        modelLabel = (TextView) modelChip.getChildAt(1);
        modelArrow = (ImageView) modelChip.getChildAt(2);
        row.addView(modelChip);

        permChip = seatChip(Seats.permIcon(Seats.permission(prefs)), 56, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showPermissionMenu(ChatActivity.this, t, prefs, permChip, new Runnable() {
                    @Override
                    public void run() {
                        renderChips();
                    }
                });
            }
        });
        permIcon = (ImageView) permChip.getChildAt(0);
        permLabel = (TextView) permChip.getChildAt(1);
        permArrow = (ImageView) permChip.getChildAt(2);
        LinearLayout.LayoutParams permLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30));
        permLp.leftMargin = t.dp(8);
        row.addView(permChip, permLp);

        row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));

        uploadButton = new FrameLayout(this);
        uploadButton.setLayoutParams(new LinearLayout.LayoutParams(t.dp(44), t.dp(44)));
        uploadButton.setBackground(t.ripple(22f));
        uploadButton.setClickable(true);
        uploadIcon = t.icon(R.drawable.ic_upload_add, t.text, 26);
        uploadButton.addView(uploadIcon,
                new FrameLayout.LayoutParams(t.dp(26), t.dp(26), Gravity.CENTER));
        uploadButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                togglePanel();
            }
        });
        row.addView(uploadButton);

        actionButton = new FrameLayout(this);
        LinearLayout.LayoutParams actionLp = new LinearLayout.LayoutParams(t.dp(44), t.dp(44));
        actionLp.leftMargin = t.dp(4);
        actionButton.setLayoutParams(actionLp);
        actionButton.setClickable(true);
        actionIcon = t.icon(R.drawable.ic_voice26, t.muted, 26);
        actionButton.addView(actionIcon,
                new FrameLayout.LayoutParams(t.dp(26), t.dp(26), Gravity.CENTER));
        actionButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (voiceMode) {
                    voiceMode = false;
                    renderInputMode();
                } else if (input.getText().toString().trim().length() > 0) {
                    send();
                } else {
                    voiceMode = true;
                    renderInputMode();
                }
            }
        });
        row.addView(actionButton);

        wrap.addView(card);

        uploadPanel = t.row();
        uploadPanel.setVisibility(View.GONE);
        uploadPanel.setPadding(0, t.dp(7), 0, 0);
        uploadPanel.addView(tile(R.drawable.ic_tile_camera, R.string.composer_upload_camera,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        takePhoto();
                    }
                }), tileLp(0));
        uploadPanel.addView(tile(R.drawable.ic_tile_photo, R.string.composer_upload_album,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        togglePanel();
                        choose();
                    }
                }), tileLp(t.dp(7)));
        uploadPanel.addView(tile(R.drawable.ic_tile_file, R.string.composer_upload_file,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        togglePanel();
                        chooseFile();
                    }
                }), tileLp(t.dp(7)));
        wrap.addView(uploadPanel);

        renderChips();
        renderInputMode();
        return wrap;
    }

    /** 第一行：输入框。hint 用官方「发消息或按住说话」。 */
    private View inputField() {
        input = new EditText(this);
        input.setHint(getString(R.string.composer_hint_voice));
        input.setHintTextColor(t.muted);
        input.setTextColor(t.text);
        input.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15f);
        input.setBackgroundColor(0x00000000);
        input.setPadding(0, t.dp(2), t.dp(6), t.dp(2));
        input.setMinHeight(t.dp(24));
        input.setMaxLines(5);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView view, int actionId, android.view.KeyEvent event) {
                if (actionId == EditorInfo.IME_ACTION_SEND) {
                    send();
                    return true;
                }
                return false;
            }
        });
        input.addTextChangedListener(new android.text.TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(android.text.Editable s) {
                renderAction();
            }
        });
        return input;
    }

    /** 第一行（语音态）：居中「按住说话」，按住录音、上滑取消。 */
    private View talkField() {
        talkBox = new FrameLayout(this);
        talkBox.setVisibility(View.GONE);
        talkBox.setBackground(t.ripple(12f));
        talkBox.setClickable(true);
        TextView label = t.text(getString(R.string.composer_hold_to_talk), 15f, t.muted);
        label.setGravity(Gravity.CENTER);
        talkBox.addView(label, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, t.dp(24), Gravity.CENTER));
        talkBox.setOnTouchListener(new View.OnTouchListener() {
            private float from;
            private boolean cancelled;

            @Override
            public boolean onTouch(View view, MotionEvent event) {
                int action = event.getActionMasked();
                if (action == MotionEvent.ACTION_DOWN) {
                    from = event.getY();
                    cancelled = false;
                    hint(true, false);
                    return true;
                }
                if (action == MotionEvent.ACTION_MOVE) {
                    boolean now = from - event.getY() > t.dp(60);
                    if (now != cancelled) {
                        cancelled = now;
                        hint(true, cancelled);
                    }
                    return true;
                }
                if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                    hint(false, false);
                    if (action == MotionEvent.ACTION_UP && !cancelled) listenSpeech();
                    return true;
                }
                return false;
            }
        });
        return talkBox;
    }

    private void hint(boolean show, boolean cancelled) {
        if (voiceHint == null) return;
        voiceHint.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) {
            voiceHint.setText(getString(cancelled
                    ? R.string.composer_release_cancel
                    : R.string.composer_release_send));
        }
    }

    private void renderInputMode() {
        if (input != null) input.setVisibility(voiceMode ? View.GONE : View.VISIBLE);
        if (talkBox != null) talkBox.setVisibility(voiceMode ? View.VISIBLE : View.GONE);
        if (voiceMode) hint(false, false);
        renderAction();
    }

    /** 动作键三态：空 = 语音 / 有字 = 发送 / 语音态 = 键盘。 */
    private void renderAction() {
        if (actionButton == null || actionIcon == null) return;
        boolean typed = input != null && input.getText().toString().trim().length() > 0;
        if (voiceMode) {
            actionButton.setBackground(t.ripple(22f));
            actionIcon.setImageResource(R.drawable.ic_keyboard26);
            actionIcon.setColorFilter(t.muted);
        } else if (typed) {
            actionButton.setBackground(t.pill(t.accent));
            actionIcon.setImageResource(R.drawable.ic_send);
            actionIcon.setColorFilter(t.onAccent);
        } else {
            actionButton.setBackground(t.ripple(22f));
            actionIcon.setImageResource(R.drawable.ic_voice26);
            actionIcon.setColorFilter(t.muted);
        }
    }

    /** composer 上的座位 chip：13dp 图标 + 12.5sp 文案 + 10dp chevronDown，高 30dp 圆角 15dp。 */
    private LinearLayout seatChip(int iconRes, int maxTextDp, View.OnClickListener click) {
        LinearLayout box = t.row();
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30)));
        box.setPadding(t.dp(7), 0, t.dp(5), 0);
        box.setBackground(t.roundStroke(t.cardFill, t.line, 15f));
        box.setClickable(true);
        box.setOnClickListener(click);

        box.addView(t.icon(iconRes, t.chipInk, 12));

        TextView text = t.text("", 12f, t.chipInk);
        text.setSingleLine(true);
        text.setEllipsize(TextUtils.TruncateAt.END);
        text.setMaxWidth(t.dp(maxTextDp));
        Theme.margin(text, t.dp(3), 0, 0, 0);
        box.addView(text);

        ImageView arrow = t.icon(R.drawable.ic_chevron_down, t.chipInk2, 9);
        Theme.margin(arrow, t.dp(1), 0, 0, 0);
        box.addView(arrow);
        return box;
    }

    private void renderChips() {
        if (modelLabel != null) modelLabel.setText(Seats.compactTitle(this, prefs));
        if (permLabel != null) {
            String permission = Seats.permission(prefs);
            permLabel.setText(Seats.permLabel(this, permission));
            if (permIcon != null) permIcon.setImageResource(Seats.permIcon(permission));
        }
        if (modelIcon != null) modelIcon.setColorFilter(t.chipInk);
        if (permIcon != null) permIcon.setColorFilter(t.chipInk);
        if (modelArrow != null) modelArrow.setColorFilter(t.chipInk2);
        if (permArrow != null) permArrow.setColorFilter(t.chipInk2);
    }

    /** 上传面板的一个方块：24dp 图标 + 13sp 标签，高 77dp。 */
    private View tile(int iconRes, int labelRes, View.OnClickListener click) {
        LinearLayout box = t.column();
        box.setGravity(Gravity.CENTER);
        box.setBackground(t.rippleOn(t.tile, 16f));
        box.setClickable(true);
        box.setOnClickListener(click);
        box.addView(t.icon(iconRes, t.text, 24));
        TextView label = t.text(getString(labelRes), 13f, t.text);
        Theme.margin(label, 0, t.dp(6), 0, 0);
        box.addView(label);
        return box;
    }

    private LinearLayout.LayoutParams tileLp(int leftMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, t.dp(77), 1f);
        lp.leftMargin = leftMargin;
        return lp;
    }

    private void togglePanel() {
        if (uploadPanel == null || uploadIcon == null) return;
        // 收起动画可能还在跑：先取消，免得上一轮的 endAction 把刚打开的格子又藏回去。
        Motion.cancel(uploadPanel);
        boolean opening = uploadPanel.getVisibility() != View.VISIBLE;
        if (opening) {
            uploadPanel.setVisibility(View.VISIBLE);
            uploadPanel.setAlpha(0f);
            Motion.fadeIn(uploadPanel, Motion.DUR_OVERLAY_IN).start();
        } else {
            Motion.fadeOut(uploadPanel, Motion.DUR_OVERLAY_IN, new Runnable() {
                @Override
                public void run() {
                    uploadPanel.setVisibility(View.GONE);
                }
            }).start();
        }
        uploadIcon.setImageResource(opening ? R.drawable.ic_upload_close : R.drawable.ic_upload_add);
    }

    private void takePhoto() {
        togglePanel();
        try {
            shotFile = new java.io.File(Shot.dir(this), "shot-" + System.currentTimeMillis() + ".jpg");
            Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, Shot.uriFor(shotFile));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, REQ_SHOT);
        } catch (android.content.ActivityNotFoundException error) {
            toast(getString(R.string.composer_camera_note));
        }
    }

    private void chooseFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        try {
            startActivityForResult(intent, REQ_FILE);
        } catch (android.content.ActivityNotFoundException error) {
            toast(getString(R.string.composer_file_note));
        }
    }

    /** 长按「按住说话」松手后交给系统语音识别；没有识别服务就提示改用键盘。 */
    private void listenSpeech() {
        Intent intent = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE,
                java.util.Locale.getDefault().toString());
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT,
                getString(R.string.composer_hold_to_talk));
        try {
            startActivityForResult(intent, REQ_ASR);
        } catch (android.content.ActivityNotFoundException error) {
            toast(getString(R.string.composer_voice_note));
        }
    }

    /* ------------------------------------------------------------------ */
    /* 数据                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * 打开会话的数据流：先铺本地缓存，再问电脑要增量。
     *
     * 老做法是「每次全量 GET 一遍 2.7MB 再整页重建」，所以同一个会话点第二次
     * 还要等；现在第二次打开是缓存秒出 + 304/增量为空，几乎没有等待。
     */
    private void load() {
        JSONObject cached = readCache();
        if (cached != null) applyDetail(cached, true);

        // 有 seq 就只要新增的；第一次打开只取尾巴（tail），不必整包拖下来。
        String path = "/v1/sessions/" + Api.enc(sessionId)
                + (since > 0 ? "?since=" + since : "?tail=300");
        api.getConditional(path, cacheEtag, new Api.Conditional() {
            @Override
            public void onOk(final boolean unchanged, final String etag, final JSONObject body) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (etag != null && etag.length() > 0) cacheEtag = etag;
                        if (unchanged) {
                            if (items.isEmpty()) {
                                renderAll();
                            } else {
                                afterLoad();
                            }
                            return;
                        }
                        if (body == null) {
                            afterLoad();
                            return;
                        }
                        applyDetail(body, false);
                        afterLoad();
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (items.isEmpty()) {
                            statusView.setText(getString(R.string.ch_load_failed_title));
                            toast(getString(R.string.ch_load_failed_toast, message));
                        }
                        afterLoad();
                    }
                });
            }
        });
    }

    /** 首屏数据到位之后再做的三件事（审批 / 反问 / 实时流）。 */
    private void afterLoad() {
        loadPendingApprovals();
        loadOpenQuestions();
        if (sse == null) connectStream();
    }

    /**
     * 把服务端的一份会话详情（全量 / 增量 / 缓存）合进 items 并重绘。
     *
     * delta=true 时 items 只含 since 之后的新条目，外加一条 head（末尾那条可能
     * 还在同一 seq 上继续长，单独带一份让这里覆盖同 id 的旧对象）。
     */
    private void applyDetail(JSONObject body, boolean fromCache) {
        if (body == null) return;
        boolean delta = body.optBoolean("delta", false);
        long nextSeq = body.optLong("seq", -1L);
        // 电脑上的时间线被重建过（seq 倒退）：本地缓存作废，重来一次。
        if (delta && since > 0 && nextSeq >= 0 && nextSeq < since) {
            items.clear();
            since = -1L;
            cacheEtag = "";
            load();
            return;
        }
        JSONArray list = body.optJSONArray("items");
        if (list != null) {
            for (int index = 0; index < list.length(); index++) {
                Item item = Item.parse(list.optJSONObject(index));
                if (item != null) items.put(item.id, item);
            }
        }
        JSONObject head = body.optJSONObject("head");
        if (head != null) {
            Item item = Item.parse(head);
            if (item != null) items.put(item.id, item);
        }
        if (body.optBoolean("truncated", false)) truncated = true;
        if (nextSeq >= 0) since = nextSeq;
        String name = body.optString("title", "");
        if (name.length() > 0 && !"未命名会话".equals(name)) {
            title = name;
            titleView.setText(name);
        }
        String next = body.optString("status", "");
        if (next.length() > 0) setStatus(next);
        // 正在看这一页 = 已读：这一轮的完成结果就在眼前，回抽屉不该再挂绿点。
        // 条数只增不减（Read.markRead 自己挡回退），所以增量详情不会把已读抹掉。
        Read.markRead(this, sessionId, items.size());
        renderAll();
        if (!fromCache) saveCache();
    }

    /* ------------------------------------------------------------------ */
    /* 本地缓存                                                          */
    /* ------------------------------------------------------------------ */

    private String cacheKey() {
        return "session-" + sessionId;
    }

    /** 读缓存：命中就顺手恢复 seq 与 ETag，后续增量请求才有依据。 */
    private JSONObject readCache() {
        try {
            JSONObject wrapper = Cache.readJson(this, cacheKey());
            if (wrapper == null) return null;
            String etag = wrapper.optString("etag", "");
            if (etag.length() > 0) cacheEtag = etag;
            if (wrapper.optBoolean("truncated", false)) truncated = true;
            JSONObject detail = wrapper.optJSONObject("detail");
            if (detail == null) return null;
            since = detail.optLong("seq", -1L);
            return detail;
        } catch (Exception error) {
            return null;
        }
    }

    /** 写缓存：只留尾部 CACHE_ITEMS 条，落盘放到后台线程（几百 KB 的 toString 别卡 UI）。 */
    private void saveCache() {
        final String payload;
        try {
            List<Item> sorted = sortedItems();
            int from = Math.max(0, sorted.size() - CACHE_ITEMS);
            JSONArray rows = new JSONArray();
            for (int index = from; index < sorted.size(); index++) {
                Item one = sorted.get(index);
                if (one.raw != null) rows.put(one.raw);
            }
            JSONObject detail = new JSONObject();
            detail.put("id", sessionId);
            detail.put("title", title == null ? "" : title);
            detail.put("seq", since);
            detail.put("status", status);
            detail.put("items", rows);
            JSONObject wrapper = new JSONObject();
            wrapper.put("etag", cacheEtag);
            wrapper.put("savedAt", System.currentTimeMillis());
            wrapper.put("truncated", truncated || from > 0);
            wrapper.put("detail", detail);
            payload = wrapper.toString();
        } catch (Exception error) {
            return;
        }
        final String key = cacheKey();
        api.pool().execute(new Runnable() {
            @Override
            public void run() {
                Cache.writeText(ChatActivity.this, key, payload);
            }
        });
    }

    private List<Item> sortedItems() {
        List<Item> sorted = new ArrayList<Item>(items.values());
        Collections.sort(sorted, new Comparator<Item>() {
            @Override
            public int compare(Item left, Item right) {
                if (left.seq != right.seq) return left.seq < right.seq ? -1 : 1;
                return left.id.compareTo(right.id);
            }
        });
        return sorted;
    }

    /**
     * 往上翻：本地还有就扩窗口；本地只存了尾巴就去电脑要全量。
     */
    private void loadOlder() {
        int step = Math.max(WINDOW * 3, 1);
        if (windowFrom > 0) {
            windowFrom = Math.max(0, windowFrom - step);
            scrollToEnd = false;
            renderAll();
            return;
        }
        toast(getString(R.string.ch_loading_older));
        api.get("/v1/sessions/" + Api.enc(sessionId), new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        JSONArray list = body.optJSONArray("items");
                        if (list != null) {
                            for (int index = 0; index < list.length(); index++) {
                                Item item = Item.parse(list.optJSONObject(index));
                                if (item != null) items.put(item.id, item);
                            }
                        }
                        long nextSeq = body.optLong("seq", -1L);
                        if (nextSeq >= 0 && nextSeq > since) since = nextSeq;
                        truncated = false;
                        List<Item> sorted = sortedItems();
                        windowFrom = Math.max(0, sorted.size() - Math.max(WINDOW * 4, 1));
                        scrollToEnd = false;
                        renderAll();
                        saveCache();
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_load_older_failed, message));
                    }
                });
            }
        });
    }

    private void loadPendingApprovals() {
        api.get("/v1/approvals?session=" + Api.enc(sessionId), new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        JSONArray list = body.optJSONArray("approvals");
                        if (list == null || list.length() == 0) {
                            noticeRow.setVisibility(View.GONE);
                            return;
                        }
                        showApproval(list.optJSONObject(0));
                    }
                });
            }

            @Override
            public void onError(String message) {
            }
        });
    }

    private void loadOpenQuestions() {
        api.get("/v1/questions?session=" + Api.enc(sessionId), new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        JSONArray list = body.optJSONArray("questions");
                        if (list == null || list.length() == 0) {
                            // 判定不变（服务端没有待答问题 → 面板该消失），守卫用 sheetEventId：真在答题时不误隐藏。
                            Motion.cancel(questionRow);
                            Motion.fadeOut(questionRow, Motion.DUR_TOGGLE, new Runnable() {
                                @Override
                                public void run() {
                                    if (sheetEventId == null) questionRow.setVisibility(View.GONE);
                                }
                            }).start();
                            return;
                        }
                        showQuestion(list.optJSONObject(0));
                    }
                });
            }

            @Override
            public void onError(String message) {
            }
        });
    }

    private void connectStream() {
        if (sse != null) sse.stop();
        sse = new Sse(prefs);
        String path = "/v1/stream?session=" + Api.enc(sessionId) + (since >= 0 ? "&since=" + since : "");
        sse.start(path, new Sse.Listener() {
            @Override
            public void onEvent(final String event, final JSONObject data) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        applyStep(event, data);
                    }
                });
            }

            @Override
            public void onState(final String state) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if ("live".equals(state)) {
                            setStatus(status);
                            loadPendingApprovals();
                            loadOpenQuestions();
                        } else if ("offline".equals(state)) {
                            statusView.setText(getString(R.string.ch_reconnecting));
                            statusView.setTextColor(t.bad);
                        }
                    }
                });
            }
        });
    }

    private void applyStep(String event, JSONObject data) {
        if (data == null) return;
        if ("item".equals(event)) {
            // SSE 的 item 事件是 {"item":{...},"sessionId":...} 包了一层的，必须取里面的 item。
            JSONObject payload = data.optJSONObject("item");
            Item item = Item.parse(payload != null ? payload : data);
            if (item == null) return;
            items.put(item.id, item);
            if (item.seq > since) since = item.seq;
            // 流式回复时每秒好几条 item，逐条整页重绘太贵：合并到 120ms 一次。
            scrollToEnd = true;
            ui.removeCallbacks(renderSoon);
            ui.postDelayed(renderSoon, 120);
        } else if ("status".equals(event)) {
            setStatus(data.optString("status", status));
        } else if ("done".equals(event)) {
            setStatus("idle");
        } else if ("approval".equals(event)) {
            showApproval(data);
        } else if ("question".equals(event)) {
            showQuestion(data);
        }
    }

    private void setStatus(String next) {
        status = next == null ? "idle" : next;
        // 判定条件一个字没动：idle 仍是「隐藏」的唯一来源、running 仍是 stopButton 的唯一「显示」来源。
        // 只把两处硬切换成 150ms 淡入淡出，endAction 里的守卫用的还是同一个 status 字段。
        if ("idle".equals(status)) {
            Motion.cancel(statusView);
            Motion.fadeOut(statusView, Motion.DUR_TOGGLE, new Runnable() {
                @Override
                public void run() {
                    if ("idle".equals(status)) {
                        statusView.setVisibility(View.GONE);
                        statusView.setText("");
                    }
                }
            }).start();
        } else {
            Motion.cancel(statusView);
            if (statusView.getVisibility() != View.VISIBLE || statusView.getAlpha() < 1f) {
                statusView.setVisibility(View.VISIBLE);
                statusView.setAlpha(0f);
                Motion.fadeIn(statusView, Motion.DUR_TOGGLE).start();
            }
        }
        if ("running".equals(status)) {
            statusView.setText(getString(R.string.ch_status_replying));
            statusView.setTextColor(t.accent);
        } else if ("waiting".equals(status)) {
            statusView.setText(getString(R.string.ch_status_waiting));
            statusView.setTextColor(t.warn);
        } else if ("failed".equals(status)) {
            statusView.setText(getString(R.string.ch_status_failed));
            statusView.setTextColor(t.bad);
        } else {
            // 清空文字挪到淡出结束（endAction）里做，好让退场的是旧文字而不是空白。
            statusView.setTextColor(t.muted);
        }
        if (stopButton != null) {
            if ("running".equals(status)) {
                Motion.cancel(stopButton);
                if (stopButton.getVisibility() != View.VISIBLE || stopButton.getAlpha() < 1f) {
                    stopButton.setVisibility(View.VISIBLE);
                    stopButton.setAlpha(0f);
                    Motion.fadeIn(stopButton, Motion.DUR_TOGGLE).start();
                }
            } else {
                Motion.cancel(stopButton);
                Motion.fadeOut(stopButton, Motion.DUR_TOGGLE, new Runnable() {
                    @Override
                    public void run() {
                        if (!"running".equals(status)) stopButton.setVisibility(View.GONE);
                    }
                }).start();
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* 渲染                                                              */
    /* ------------------------------------------------------------------ */

    private void renderAll() {
        ui.removeCallbacks(renderSoon);
        int before = timeline.getChildCount();
        timeline.removeAllViews();
        barPainters.clear();
        List<Item> sorted = sortedItems();
        // 首屏只画尾巴：3400+ 条的会话全量建视图要几秒，官方也是往上翻才继续加载。
        if (windowFrom < 0 || windowFrom > sorted.size()) {
            windowFrom = Math.max(0, sorted.size() - Math.max(WINDOW, 1));
        }
        // 免责声明挂在最后一条助手消息下面，先把它的 id 标出来。
        lastAssistantId = "";
        for (Item one : sorted) {
            if (!one.isUser() && !one.isTool() && !one.isPermission() && !"marker".equals(one.kind)) {
                lastAssistantId = one.id;
            }
        }
        if (sorted.isEmpty()) {
            timeline.addView(welcome());
        } else {
            if (windowFrom > 0 || truncated) {
                timeline.addView(olderRow(windowFrom > 0 ? Math.min(WINDOW, windowFrom) : 0));
            }
            // 官方把一整轮里的「思考 + 工具调用」收成一个可展开块，默认只留一行灰字。
            // 这里同样按连续的「思考标记 / 工具项」聚成组，展开后仍保留每项自己的详情。
            for (int index = windowFrom; index < sorted.size(); ) {
                Item item = sorted.get(index);
                if (!thinkOrTool(item)) {
                    View view = bubble(item);
                    if (view != null) timeline.addView(view);
                    index++;
                    continue;
                }
                int end = index;
                int toolCount = 0;
                int seconds = 0;
                boolean hasThink = false;
                while (end < sorted.size() && thinkOrTool(sorted.get(end))) {
                    Item each = sorted.get(end);
                    if (each.isTool()) {
                        toolCount++;
                    } else {
                        hasThink = true;
                        seconds = Math.max(seconds, thinkSeconds((each.title == null ? "" : each.title)
                                + " " + (each.text == null ? "" : each.text)));
                    }
                    end++;
                }
                // 这一块是不是本轮最后一块（后面紧跟用户消息或没有后续）：
                // 是的话它承担「这一轮的生成结果」，操作条挂在它身上，否则会让同一轮出现两条操作条。
                // 本轮已经有正文时正文自己带操作条，这里不再补，避免同一轮出现两条。
                boolean tail = !contentAfter(sorted, end) && !roundHasText(sorted, index);
                timeline.addView(thinkGroup(sorted.subList(index, end), hasThink, toolCount, seconds, tail));
                index = end;
            }
        }
        // 往上翻旧消息时不要跳到底部，停在顶部让用户接着往上读。
        if (!scrollToEnd) {
            scrollToEnd = true;
            scroller.post(new Runnable() {
                @Override
                public void run() {
                    scroller.scrollTo(0, 0);
                }
            });
            return;
        }
        scroller.post(new Runnable() {
            @Override
            public void run() {
                scroller.fullScroll(View.FOCUS_DOWN);
            }
        });
        if (before == 0) {
            scroller.scrollTo(0, 0);
            scroller.post(new Runnable() {
                @Override
                public void run() {
                    scroller.fullScroll(View.FOCUS_DOWN);
                }
            });
        }
    }

    /**
     * 顶部那条「载入更早的消息」。
     *
     * count>0 表示本地还有多少条可以就地展开；count==0 表示本地只存了尾巴，
     * 点一下要去电脑要全量。
     */
    private View olderRow(final int count) {
        String label = count > 0
                ? getString(R.string.ch_older_count, count)
                : getString(R.string.ch_older_all);
        TextView row = t.text(label, 13f, t.muted);
        row.setGravity(Gravity.CENTER);
        row.setPadding(0, t.dp(10), 0, t.dp(12));
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                loadOlder();
            }
        });
        return row;
    }

    /* ------------------------------------------------------------------ */
    /* 轻量 Markdown：官方 App 会把 **粗体**、`代码`、# 标题、- 列表渲染成  */
    /* 富文本；这里用 span 做同名子集，避免用户看到裸露的星号与反引号。      */
    /* ------------------------------------------------------------------ */

    private static final char TICK = (char) 96;

    private CharSequence richText(String raw) {
        if (raw == null) return "";
        String[] rows = raw.split("\n", -1);
        SpannableStringBuilder out = new SpannableStringBuilder();
        for (int i = 0; i < rows.length; i++) {
            String line = rows[i];
            boolean bullet = false;
            String trimmed = line.trim();
            // 官方不渲染本地图片语法与分隔线：![alt](path) 整行丢掉，"---" 换成细线字符。
            if (trimmed.startsWith("![") && trimmed.endsWith(")")) continue;
            if (trimmed.equals("---") || trimmed.equals("***") || trimmed.equals("___")) {
                line = "————————————";
                trimmed = line;
            }
            if (trimmed.startsWith("### ") || trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
                int cut = trimmed.indexOf(' ');
                line = trimmed.substring(cut + 1);
                bullet = false;
            } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) {
                line = "•  " + trimmed.substring(2);
                bullet = true;
            }
            int start = out.length();
            out.append(line);
            inlineSpans(out, start, out.length());
            boolean heading = trimmed.startsWith("#");
            if (heading) {
                out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(),
                        SpannableStringBuilder.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
            if (i < rows.length - 1) out.append('\n');
            if (bullet) { /* 项目符号已就地替换，无需额外缩进 */ }
        }
        return out;
    }

    /** **粗体** 与 `行内代码` 的 span 标注。 */
    private void inlineSpans(SpannableStringBuilder out, int from, int to) {
        int index = from;
        while (index < to) {
            if (out.charAt(index) == '*' && index + 1 < to && out.charAt(index + 1) == '*') {
                int close = out.toString().indexOf("**", index + 2);
                if (close > 0 && close < to) {
                    out.delete(close, close + 2);
                    out.delete(index, index + 2);
                    out.setSpan(new StyleSpan(Typeface.BOLD), index, close - 2,
                            SpannableStringBuilder.SPAN_EXCLUSIVE_EXCLUSIVE);
                    index = close - 2;
                    to -= 4;
                    continue;
                }
            }
            if (out.charAt(index) == TICK) {
                int close = out.toString().indexOf(String.valueOf(TICK), index + 1);
                if (close > 0 && close < to) {
                    out.delete(close, close + 1);
                    out.delete(index, index + 1);
                    out.setSpan(new TypefaceSpan("monospace"), index, close - 1,
                            SpannableStringBuilder.SPAN_EXCLUSIVE_EXCLUSIVE);
                    out.setSpan(new BackgroundColorSpan(Theme.alpha(t.text, 0.06f)), index, close - 1,
                            SpannableStringBuilder.SPAN_EXCLUSIVE_EXCLUSIVE);
                    index = close - 1;
                    to -= 2;
                    continue;
                }
            }
            index++;
        }
    }

    /** 一条消息。用户靠右气泡（最宽 68% 屏宽），助手整宽无气泡。 */
    private View bubble(final Item item) {
        if (item.isTool()) return toolView(item);
        if (item.isPermission()) return null;
        if ("marker".equals(item.kind)) return markerView(item);

        LinearLayout outer = t.column();
        // 上下各 6dp：两条消息之间正好 12dp。
        outer.setPadding(0, t.dp(6), 0, t.dp(6));

        final boolean user = item.isUser();
        String text = item.body(this);
        boolean hasText = text != null && text.length() > 0;
        List<Item.ImageRef> pictures = item.pictures();
        boolean lastAssistant = !user && item.id.equals(lastAssistantId);
        View anchor = outer;

        if (hasText) {
            TextView body = t.text(text, 16f, t.text);
            // 故意不开 setTextIsSelectable：那样长按会被系统文字选择器吃掉，
            // 官方 App 长按消息出的是浮层菜单，这里照做。
            if (user) {
                body.setLineSpacing(t.dp(5), 1f);
                body.setBackground(t.round(t.bubble, 20f));
                body.setPadding(t.dp(14), t.dp(10), t.dp(14), t.dp(10));
                body.setMaxWidth((int) (getResources().getDisplayMetrics().widthPixels * 0.68f));
                LinearLayout holder = t.column();
                holder.setGravity(Gravity.END);
                // 必须显式 WRAP_CONTENT：LinearLayout 的默认 LP 是 MATCH_PARENT，
                // 一旦交给它撑满，setMaxWidth 就失效，气泡会变成整宽（不再是官方的右侧窄气泡）。
                holder.addView(body, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                outer.addView(holder);
                anchor = body;
            } else {
                // 助手正文：整宽、无底色、左对齐，行距约 1.5。
                body.setLineSpacing(t.dp(9), 1f);
                body.setText(richText(text));
                outer.addView(body, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
                anchor = body;
            }
        }

        for (Item.ImageRef ref : pictures) {
            View picture = pictureView(ref);
            if (user) {
                LinearLayout holder = t.column();
                holder.setGravity(Gravity.END);
                holder.addView(picture);
                Theme.margin(picture, 0, t.dp(6), 0, 0);
                outer.addView(holder);
            } else {
                Theme.margin(picture, 0, t.dp(6), 0, 0);
                outer.addView(picture);
            }
        }

        BarTarget target = new BarTarget(item);
        if (user) {
            outer.addView(userBar(target));
        } else {
            if (lastAssistant) outer.addView(disclaimer());
            outer.addView(assistantBar(target));
        }

        // 整条消息（气泡、图片、空白处、操作条）都能长按出菜单；浮层贴在这条消息上。
        hookLongPress(outer, anchor, item, true);
        return outer;
    }

    /** 给一个子树挂长按 → 浮层菜单；anchor 是浮层要对齐的那条消息。 */
    private void hookLongPress(View view, final View anchor, final Item item, boolean attachSelf) {
        // 记下按下的屏幕坐标：浮层要贴住手指位置，而不是贴住整条消息的包围盒
        // （助手消息常常整屏高，按包围盒算会把浮层顶到屏幕外）。
        view.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View target, MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    menuTouchX = (int) event.getRawX();
                    menuTouchY = (int) event.getRawY();
                }
                return false;
            }
        });
        if (attachSelf) {
            view.setOnLongClickListener(new View.OnLongClickListener() {
                @Override
                public boolean onLongClick(View target) {
                    showMessageMenu(item, anchor);
                    return true;
                }
            });
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                hookLongPress(group.getChildAt(i), anchor, item, true);
            }
        }
    }

    /** 官方风格的图标操作（20dp 单色 + 水波纹）。 */
    /**
     * 操作条上的一个图形按钮。
     *
     * 官方 2.6.1 的几何：图标 20dp、图标之间 18dp、整行高 40dp；
     * 触摸区取 32x40dp 且图标居中，那么 32 - 20 + 6 = 18dp 正好是图标间距。
     */
    private static final class IconAction {
        final FrameLayout box;
        final ImageView icon;

        IconAction(FrameLayout box, ImageView icon) {
            this.box = box;
            this.icon = icon;
        }
    }

    private IconAction addIconAction(LinearLayout parent, int res, int color, final Runnable action) {
        FrameLayout box = new FrameLayout(this);
        ImageView icon = new ImageView(this);
        icon.setImageResource(res);
        icon.setColorFilter(color);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        box.addView(icon, new FrameLayout.LayoutParams(t.dp(20), t.dp(20), Gravity.CENTER));
        box.setBackground(t.ripple(10f));
        IconAction holder = new IconAction(box, icon);
        if (action != null) bindAction(holder, action);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(t.dp(32), t.dp(40));
        lp.rightMargin = t.dp(6);
        parent.addView(box, lp);
        return holder;
    }

    private void bindAction(final IconAction holder, final Runnable action) {
        holder.box.setClickable(true);
        holder.box.setFocusable(true);
        holder.box.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                action.run();
            }
        });
    }

    /** 免责声明：紧跟最后一条助手消息，左对齐，13sp 次级字。 */
    private View disclaimer() {
        TextView note = t.text(getString(R.string.session_a_i_alert), 13f, t.muted);
        Theme.margin(note, 0, t.dp(10), 0, 0);
        return note;
    }

    /**
     * 操作条的作用对象：一条消息，或一整块「思考 + 工具调用」生成区。
     *
     * 聚合块没有单一 Item（它的正文是好几条拼起来的），所以这里把 id / 正文 / 图片 / seq
     * 单独提出来 —— 六个动作只认这个对象，才能同时覆盖「正文消息」和「纯 agent 轮次」。
     */
    private final class BarTarget {
        final String id;
        final String text;
        final List<Item.ImageRef> pictures;
        final long seq;
        final Item item;

        BarTarget(Item one) {
            this(one.id, one.body(ChatActivity.this), one.pictures(), one.seq, one);
        }

        BarTarget(String id, String text, List<Item.ImageRef> pictures, long seq, Item item) {
            this.id = id == null ? "" : id;
            this.text = text == null ? "" : text;
            this.pictures = pictures == null ? new ArrayList<Item.ImageRef>() : pictures;
            this.seq = seq;
            this.item = item;
        }
    }

    /** 一整块「思考 + 工具调用」聚合成的操作对象：正文是这块里全部可读文字。 */
    private BarTarget groupTarget(List<Item> members) {
        StringBuilder sb = new StringBuilder();
        for (Item each : members) {
            String line = each.isTool() ? each.body(this) : (each.text == null ? "" : each.text);
            if (line == null || line.length() == 0) continue;
            if (sb.length() > 0) sb.append("\n\n");
            sb.append(line);
        }
        Item first = members.get(0);
        Item last = members.get(members.size() - 1);
        return new BarTarget(first.id, sb.toString(), null, last.seq, last);
    }

    /** 助手操作条：复制 / 赞 / 踩 / 朗读 / 分享 / 弹簧 / 重新生成（贴右）。 */
    private View assistantBar(final BarTarget target) {
        LinearLayout bar = t.row();
        bar.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(40)));
        Theme.margin(bar, 0, t.dp(2), 0, 0);

        addIconAction(bar, R.drawable.ic_copy, t.muted2, new Runnable() {
            @Override
            public void run() {
                copyMessage(target);
            }
        });

        final IconAction like = addIconAction(bar, R.drawable.ic_like, t.muted2, new Runnable() {
            @Override
            public void run() {
                toggleFeedback(target, true);
            }
        });
        final IconAction dislike = addIconAction(bar, R.drawable.ic_dislike, t.muted2, new Runnable() {
            @Override
            public void run() {
                toggleFeedback(target, false);
            }
        });
        final IconAction speak = addIconAction(bar, R.drawable.ic_volume, t.muted2, new Runnable() {
            @Override
            public void run() {
                toggleSpeak(target);
            }
        });
        addIconAction(bar, R.drawable.ic_share, t.muted2, new Runnable() {
            @Override
            public void run() {
                share(target);
            }
        });

        restoreFeedback(target.id);
        Runnable paint = new Runnable() {
            @Override
            public void run() {
                boolean up = likedIds.contains(target.id);
                boolean down = dislikedIds.contains(target.id);
                boolean speaking = target.id.equals(speakingId);
                like.icon.setImageResource(up ? R.drawable.ic_like_fill : R.drawable.ic_like);
                like.icon.setColorFilter(up ? t.accent : t.muted2);
                dislike.icon.setImageResource(down ? R.drawable.ic_dislike_fill : R.drawable.ic_dislike);
                dislike.icon.setColorFilter(down ? t.accent : t.muted2);
                speak.icon.setImageResource(speaking ? R.drawable.ic_mute : R.drawable.ic_volume);
                speak.icon.setColorFilter(speaking ? t.accent : t.muted2);
            }
        };
        barPainters.put(target.id, paint);
        paint.run();

        if (target.item != null && "failed".equals(target.item.status)) {
            TextView bad = t.text(getString(R.string.ch_badge_failed), 11f, t.bad);
            Theme.margin(bad, t.dp(4), 0, 0, 0);
            bar.addView(bad);
        }

        // 弹簧：把「重新生成」顶到最右边（右边 16dp 由时间线的内边距给出）。
        bar.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));

        IconAction again = addIconAction(bar, R.drawable.ic_regenerate, t.muted2, new Runnable() {
            @Override
            public void run() {
                regenerate(target);
            }
        });
        LinearLayout.LayoutParams againLp = (LinearLayout.LayoutParams) again.box.getLayoutParams();
        againLp.rightMargin = 0;
        again.box.setLayoutParams(againLp);
        return bar;
    }

    /** 用户操作条：只保留 复制 + 分享，右对齐。 */
    private View userBar(final BarTarget target) {
        LinearLayout bar = t.row();
        bar.setGravity(Gravity.END);
        bar.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(40)));
        addIconAction(bar, R.drawable.ic_copy, t.muted2, new Runnable() {
            @Override
            public void run() {
                copyMessage(target);
            }
        });
        IconAction shareBox = addIconAction(bar, R.drawable.ic_share, t.muted2, new Runnable() {
            @Override
            public void run() {
                share(target);
            }
        });
        LinearLayout.LayoutParams shareLp = (LinearLayout.LayoutParams) shareBox.box.getLayoutParams();
        shareLp.rightMargin = 0;
        shareBox.box.setLayoutParams(shareLp);
        return bar;
    }

    /**
     * 这一块后面还有没有真的「助手内容」。
     *
     * 一条消息末尾常跟一条系统标记（「处理完成」那种小胶囊），它不算内容，
     * 所以往后走时要跳过；撞到用户消息或者到尾就算没有了。
     */
    private boolean contentAfter(List<Item> sorted, int from) {
        for (int at = from; at < sorted.size(); at++) {
            Item one = sorted.get(at);
            if (one.isUser()) return false;
            if ("system".equals(one.role)) continue;
            return true;
        }
        return false;
    }

    /**
     * 这一轮（前后都是一条用户消息的那一段）里有没有助手正文。
     *
     * 有正文的轮次，操作条已经挂在正文上了；只有纯「思考 + 工具调用」的轮次
     * （agent 型会话常见）才需要由聚合块来承担操作条。
     */
    private boolean roundHasText(List<Item> sorted, int index) {
        int from = index;
        while (from > 0 && !sorted.get(from).isUser()) from--;
        for (int at = from; at < sorted.size(); at++) {
            Item one = sorted.get(at);
            if (one.isUser()) {
                if (at > index) break;
                continue;
            }
            if (!thinkOrTool(one) && one.text != null && one.text.trim().length() > 0) return true;
        }
        return false;
    }

    /** 重画所有操作条上的可切换图标（赞 / 踩 / 朗读）。 */
    private void refreshBars() {
        for (Runnable paint : new ArrayList<Runnable>(barPainters.values())) {
            paint.run();
        }
    }

    /** 赞 / 踩：本地切状态并重画图标，赞和踩互斥；状态写进本机 prefs，重进会话还在。 */
    private void toggleFeedback(BarTarget target, boolean up) {
        String id = target.id;
        boolean on;
        if (up) {
            if (!likedIds.remove(id)) {
                likedIds.add(id);
                dislikedIds.remove(id);
                on = true;
            } else {
                on = false;
            }
        } else {
            if (!dislikedIds.remove(id)) {
                dislikedIds.add(id);
                likedIds.remove(id);
                on = true;
            } else {
                on = false;
            }
        }
        prefs.setMessageFeedback(sessionId, id, on ? (up ? "like" : "dislike") : "");
        refreshBars();
        if (!on) {
            toast(getString(R.string.ch_feedback_cleared));
        } else if (up) {
            toast(getString(R.string.ch_feedback_liked));
        } else {
            toast(getString(R.string.ch_feedback_disliked));
        }
    }

    /** 把本机存过的赞/踩状态回填到内存集合（每条消息只读一次）。 */
    private void restoreFeedback(String id) {
        if (id == null || id.length() == 0) return;
        if (!feedbackRestored.add(id)) return;
        String saved = prefs.messageFeedback(sessionId, id);
        if ("like".equals(saved)) {
            likedIds.add(id);
            dislikedIds.remove(id);
        } else if ("dislike".equals(saved)) {
            dislikedIds.add(id);
            likedIds.remove(id);
        }
    }

    /** 分享消息正文到系统其它应用。 */
    private void share(BarTarget target) {
        String text = target.text;
        if (text == null || text.length() == 0) {
            toast(getString(R.string.ch_share_empty));
            return;
        }
        android.content.Intent send = new android.content.Intent(android.content.Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(android.content.Intent.EXTRA_TEXT, text);
        // 没有能接分享的应用时别弹空选择器：直接把正文塞进剪贴板并说明。
        boolean any = true;
        try {
            any = !getPackageManager()
                    .queryIntentActivities(send, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
                    .isEmpty();
        } catch (Exception ignored) {
            any = true;
        }
        if (!any) {
            setClipboard(text);
            toast(getString(R.string.ch_share_copied));
            return;
        }
        try {
            startActivity(android.content.Intent.createChooser(send, getString(R.string.share)));
        } catch (Exception error) {
            setClipboard(text);
            toast(getString(R.string.ch_share_copied));
        }
    }

    /** 消息底部那排小字按钮。 */
    private void addAction(LinearLayout parent, String label, final Runnable action) {
        TextView button = t.text(label, 11f, t.muted);
        button.setPadding(t.dp(8), t.dp(4), t.dp(8), t.dp(4));
        button.setBackground(t.ripple(8f));
        button.setClickable(true);
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                action.run();
            }
        });
        parent.addView(button);
    }

    /**
     * 服务端下发的思考标记是中文固定词（协议约定，不随界面语言变）。
     * 判定时两边都认：服务端原文，以及当前语言的资源文案（保证切语言不影响分派）。
     */
    private static final String MARKER_THINKING = "思考";

    private boolean isThinkingMarker(String title) {
        if (title == null) return false;
        return title.contains(MARKER_THINKING)
                || title.contains(getString(R.string.message_reasoning_marker));
    }

    /** 连续的「思考标记 / 工具调用」在官方形态里属于同一块思考区。 */
    private boolean thinkOrTool(Item one) {
        if (one == null) return false;
        if (one.isTool()) return true;
        if (!"marker".equals(one.kind)) return false;
        String title = one.title == null ? "" : one.title;
        return isThinkingMarker(title);
    }

    /** 一整轮思考区：默认折叠成「已思考（用时 N 秒）· 工具调用 M 次」一行。 */
    private View thinkGroup(List<Item> members, boolean hasThink, int tools, int seconds, boolean tail) {
        String key = members.get(0).id;
        final LinearLayout wrap = t.column();
        Theme.margin(wrap, 0, t.dp(8), 0, t.dp(8));

        final boolean open = openGroups.contains(key);
        final ImageView chevron = t.icon(R.drawable.ic_chevron_right, t.muted2, 14);
        chevron.setRotation(open ? 90f : 0f);

        final LinearLayout head = t.row();
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setBackground(t.ripple(8f));
        head.setClickable(true);
        head.setPadding(0, t.dp(4), t.dp(6), t.dp(4));

        String label = hasThink ? getString(R.string.message_think_duration, Math.max(1, seconds)) : "";
        if (tools > 0) {
            String toolLabel = tools == 1
                    ? getString(R.string.ch_tool_call_one)
                    : getString(R.string.ch_tool_calls, tools);
            label = label.length() == 0 ? toolLabel : label + " · " + toolLabel;
        }
        head.addView(t.text(label, 13f, t.muted));
        Theme.margin(chevron, t.dp(4), 0, 0, 0);
        head.addView(chevron);
        wrap.addView(head);

        final LinearLayout body = t.column();
        Theme.margin(body, 0, t.dp(2), 0, 0);
        for (Item each : members) {
            if (each.isTool()) {
                body.addView(toolView(each));
                continue;
            }
            String raw = each.text == null ? "" : each.text;
            for (String line : raw.split("\n")) {
                String each2 = line == null ? "" : line.trim();
                if (each2.length() == 0) continue;
                View paragraph = thinkParagraph(each2);
                Theme.margin(paragraph, 0, t.dp(4), 0, 0);
                body.addView(paragraph, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            }
        }
        body.setVisibility(open ? View.VISIBLE : View.GONE);
        wrap.addView(body);
        // 整轮只有思考 / 工具、没有任何正文时（常见于 agent 型会话），
        // 这一块就是这一轮的「生成结果」：操作条挂在这里，复制/朗读/分享/重新生成才有对象。
        if (tail) {
            Theme.margin(wrap, 0, 0, 0, 0);
            wrap.addView(assistantBar(groupTarget(members)));
        }

        head.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                boolean willOpen = body.getVisibility() != View.VISIBLE;
                // 表现层：折叠体淡入/淡出 + chevron 旋转（时长/曲线走 Motion 令牌）。
                // 展开态仍由 setVisibility 决定，**不改高度、不介入 measure**。
                if (willOpen) {
                    body.setVisibility(View.VISIBLE);
                    Motion.fadeIn(body, Motion.durFade(ChatActivity.this, Motion.DUR_TOGGLE)).start();
                } else {
                    Motion.fadeOut(body, Motion.durFade(ChatActivity.this, Motion.DUR_TOGGLE), new Runnable() {
                        @Override
                        public void run() {
                            // 期间又被点开过就不收起来（状态判定与原来一致）
                            if (!openGroups.contains(key)) body.setVisibility(View.GONE);
                        }
                    }).start();
                }
                chevron.animate().rotation(willOpen ? 90f : 0f)
                        .setDuration(Motion.durMotion(ChatActivity.this, Motion.DUR_TOGGLE))
                        .setInterpolator(Motion.EASE_STANDARD).start();
                if (willOpen) openGroups.add(key);
                else openGroups.remove(key);
            }
        });
        return wrap;
    }

    private View markerView(final Item item) {
        String title = item.title == null ? "" : item.title;
        String body = item.text == null ? "" : item.text;
        if (!isThinkingMarker(title)) {
            // 其它 marker（比如「已浏览 N 个页面」）还是原来那条小胶囊。
            String text = title + (body.length() == 0 ? "" : "：" + body);
            if (body.length() > 60) text = title;
            LinearLayout capsule = t.row();
            capsule.setPadding(t.dp(10), t.dp(5), t.dp(12), t.dp(5));
            capsule.setBackground(t.pill(t.surfaceAlt));
            capsule.addView(t.text(text, 11f, t.muted));
            LinearLayout holder = t.column();
            holder.setGravity(Gravity.CENTER);
            holder.setPadding(0, t.dp(4), 0, t.dp(4));
            holder.addView(capsule);
            return holder;
        }

        // 官方形态：一行灰字「已思考（用时 N 秒）」+ 紧跟其后的 chevron，没有胶囊底色。
        final LinearLayout wrap = t.column();
        Theme.margin(wrap, 0, t.dp(8), 0, t.dp(8));

        final boolean open = expandedMarkers.contains(item.id);
        final ImageView chevron = t.icon(R.drawable.ic_chevron_right, t.muted2, 14);
        chevron.setRotation(open ? 90f : 0f);
        final LinearLayout head = t.row();
        head.setBackground(t.ripple(8f));
        head.setClickable(true);
        head.setPadding(0, t.dp(4), t.dp(6), t.dp(4));
        head.addView(t.text(getString(R.string.message_think_duration, thinkSeconds(title + " " + body)), 13f, t.muted));
        Theme.margin(chevron, t.dp(4), 0, 0, 0);
        head.addView(chevron);
        wrap.addView(head);

        final LinearLayout text = t.column();
        Theme.margin(text, 0, t.dp(4), 0, 0);
        boolean first = true;
        for (String raw : body.split("\n")) {
            String each = raw == null ? "" : raw.trim();
            if (each.length() == 0) continue;
            View line = thinkParagraph(each);
            if (!first) Theme.margin(line, 0, t.dp(6), 0, 0);
            text.addView(line, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            first = false;
        }
        text.setVisibility(open ? View.VISIBLE : View.GONE);
        wrap.addView(text);

        head.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                boolean willOpen = text.getVisibility() != View.VISIBLE;
                // 同 thinkGroup：只加淡入淡出与 chevron 旋转，不碰高度/measure。
                if (willOpen) {
                    text.setVisibility(View.VISIBLE);
                    Motion.fadeIn(text, Motion.durFade(ChatActivity.this, Motion.DUR_TOGGLE)).start();
                } else {
                    Motion.fadeOut(text, Motion.durFade(ChatActivity.this, Motion.DUR_TOGGLE), new Runnable() {
                        @Override
                        public void run() {
                            if (!expandedMarkers.contains(item.id)) text.setVisibility(View.GONE);
                        }
                    }).start();
                }
                chevron.animate().rotation(willOpen ? 90f : 0f)
                        .setDuration(Motion.durMotion(ChatActivity.this, Motion.DUR_TOGGLE))
                        .setInterpolator(Motion.EASE_STANDARD).start();
                if (willOpen) expandedMarkers.add(item.id);
                else expandedMarkers.remove(item.id);
            }
        });
        return wrap;
    }

    /** 思考正文的一段：左边 2dp 竖线（跟内容等高）+ 12dp 缩进的灰字，无底色无圆角。 */
    private View thinkParagraph(String paragraph) {
        FrameLayout box = new FrameLayout(this);
        View rule = new View(this);
        rule.setBackground(t.round(t.line, 1f));
        box.addView(rule, new FrameLayout.LayoutParams(t.dp(2), FrameLayout.LayoutParams.MATCH_PARENT));
        TextView text = t.text(paragraph, 13f, t.muted);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = t.dp(12);
        box.addView(text, lp);
        return box;
    }

    /** 从标题里抠出「用时 N 秒」的 N；抠不到就按 3 秒算。 */
    private static int thinkSeconds(String raw) {
        if (raw == null) return 3;
        int start = -1;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            boolean digit = c >= '0' && c <= '9';
            if (digit) {
                if (start < 0) start = i;
                continue;
            }
            if (start >= 0) {
                if (c == '秒') {
                    try {
                        int value = Integer.parseInt(raw.substring(start, i));
                        if (value > 0 && value < 600) return value;
                    } catch (Exception error) {
                        return 3;
                    }
                }
                start = -1;
            }
        }
        return 3;
    }

    private View toolView(final Item item) {
        /* 官方思考区的工具痕迹是纯文本行（无卡片、无描边），这里同样收敛成
           「✓ 工具名  展开」的轻量行，保留展开看详情的独有能力。 */
        LinearLayout card = t.column();
        card.setPadding(t.dp(2), t.dp(5), 0, t.dp(5));
        card.setBackground(null);
        Theme.margin(card, 0, t.dp(1), 0, t.dp(1));

        LinearLayout head = t.row();
        ImageView mark = t.icon(R.drawable.ic_check, "failed".equals(item.status) ? t.bad : t.muted, 14);
        head.addView(mark);
        TextView name = t.mono(item.toolName.length() == 0 ? getString(R.string.ch_tool_unknown) : item.toolName, 12f,
                "failed".equals(item.status) ? t.bad : t.muted);
        Theme.margin(name, t.dp(6), 0, 0, 0);
        head.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView toggle = t.text(getString(R.string.ch_expand), 11f, t.muted2);
        head.addView(toggle);
        card.addView(head);

        TextView detail = t.mono(item.body(this), 11f, t.muted);
        detail.setVisibility(View.GONE);
        detail.setTextIsSelectable(true);
        Theme.margin(detail, 0, t.dp(6), 0, 0);
        card.addView(detail);

        final TextView toggleRef = toggle;
        final TextView detailRef = detail;
        View.OnClickListener flip = new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                final boolean show = detailRef.getVisibility() != View.VISIBLE;
                if (show) {
                    Motion.cancel(detailRef);
                    detailRef.setVisibility(View.VISIBLE);
                    detailRef.setAlpha(0f);
                    Motion.fadeIn(detailRef, Motion.DUR_TOGGLE).start();
                } else {
                    Motion.fadeOut(detailRef, Motion.DUR_TOGGLE, new Runnable() {
                        @Override
                        public void run() {
                            // 守卫：这一轮仍是「收起」，且淡出确实走到了 0（被 cancel 打断就不隐藏）。
                            if (!show && detailRef.getAlpha() <= 0.01f) detailRef.setVisibility(View.GONE);
                        }
                    }).start();
                }
                toggleRef.setText(show
                        ? getString(R.string.ch_collapse)
                        : getString(R.string.ch_expand));
            }
        };
        head.setOnClickListener(flip);
        detail.setOnClickListener(flip);
        return card;
    }

    private View pictureView(final Item.ImageRef ref) {
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surfaceAlt, 16f));
        card.setPadding(t.dp(5), t.dp(5), t.dp(5), t.dp(5));
        card.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        FrameLayout frame = new FrameLayout(this);
        TextView hint = t.text(getString(R.string.ch_image_loading), 11f, t.muted);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(t.dp(30), t.dp(26), t.dp(30), t.dp(26));
        frame.addView(hint);
        final ImageView image = new ImageView(this);
        image.setVisibility(View.GONE);
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setMaxWidth(pictureWidth);
        image.setMaxHeight(pictureWidth);
        frame.addView(image);
        card.addView(frame);

        android.graphics.Bitmap cached = Img.cached(ref.attachmentId, pictureWidth);
        if (cached != null) {
            image.setImageBitmap(cached);
            image.setVisibility(View.VISIBLE);
            hint.setVisibility(View.GONE);
        } else {
            Img.load(this, prefs, sessionId, ref.attachmentId, pictureWidth, new Img.Callback() {
                @Override
                public void onOk(final android.graphics.Bitmap bitmap) {
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            image.setImageBitmap(bitmap);
                            image.setVisibility(View.VISIBLE);
                            hint.setVisibility(View.GONE);
                        }
                    });
                }

                @Override
                public void onError(final String message) {
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            hint.setText(getString(R.string.ch_image_failed));
                            hint.setTextColor(t.bad);
                        }
                    });
                }
            });
        }
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openPicture(ref);
            }
        });
        return card;
    }

    private void openPicture(final Item.ImageRef ref) {
        FrameLayout holder = new FrameLayout(this);
        holder.setBackgroundColor(t.surfaceAlt);
        final ImageView image = new ImageView(this);
        image.setAdjustViewBounds(true);
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int width = getResources().getDisplayMetrics().widthPixels;
        image.setMinimumWidth(width);
        holder.addView(image, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        android.graphics.Bitmap cached = Img.cached(ref.attachmentId, 1600);
        if (cached != null) image.setImageBitmap(cached);
        else {
            Img.load(this, prefs, sessionId, ref.attachmentId, 1600, new Img.Callback() {
                @Override
                public void onOk(final android.graphics.Bitmap bitmap) {
                    ui.post(new Runnable() {
                        @Override
                        public void run() {
                            image.setImageBitmap(bitmap);
                        }
                    });
                }

                @Override
                public void onError(String message) {
                }
            });
        }
        new AlertDialog.Builder(this).setView(holder).setPositiveButton(getString(R.string.ch_close), null).show();
    }

    /* ------------------------------------------------------------------ */
    /* 长按菜单                                                          */
    /* ------------------------------------------------------------------ */

    /** 长按一条消息：在消息上方弹出官方样式的浮层菜单。 */
    private void showMessageMenu(final Item item, final View anchor) {
        dismissMessageMenu();
        // 选择面板还开着就先收起来，免得两层浮层叠在一起。
        closeSelectSheet();
        String bodyText = item.body(this);
        boolean hasText = bodyText != null && bodyText.length() > 0;
        final BarTarget target = new BarTarget(item);

        LinearLayout card = t.column();
        card.setPadding(0, t.dp(6), 0, t.dp(6));
        // 圆角卡片直接画在内容视图上（PopupWindow 的 window 背景在部分机型不落色）。
        card.setBackground(t.roundStroke(t.dark ? t.cardFill : 0xFFFFFFFF,
                t.dark ? t.line : 0x1A000000, 14f));

        int rows = 0;
        // 没有正文的消息（纯图 / 工具项）不给「复制 / 选择文本」：点了也没东西可拿。
        if (hasText) {
            menuRow(card, R.drawable.ic_copy, getString(R.string.message_press_copy), new Runnable() {
                @Override
                public void run() {
                    copyMessage(target);
                }
            });
            rows++;
            menuRow(card, R.drawable.ic_select_text, getString(R.string.message_select_text), new Runnable() {
                @Override
                public void run() {
                    selectText(item);
                }
            });
            rows++;
        }

        if (item.isUser()) {
            if (isLastUserMessage(item)) {
                menuRow(card, R.drawable.ic_edit, getString(R.string.message_press_edit), new Runnable() {
                    @Override
                    public void run() {
                        editMessage(item);
                    }
                });
                rows++;
            }
        } else {
            menuRow(card, R.drawable.ic_regenerate, getString(R.string.message_press_regenerate), new Runnable() {
                @Override
                public void run() {
                    regenerate(target);
                }
            });
            rows++;
            menuRow(card, likedIds.contains(item.id) ? R.drawable.ic_like_fill : R.drawable.ic_like,
                    getString(R.string.message_press_like), new Runnable() {
                        @Override
                        public void run() {
                            toggleFeedback(target, true);
                        }
                    });
            rows++;
            menuRow(card, dislikedIds.contains(item.id) ? R.drawable.ic_dislike_fill : R.drawable.ic_dislike,
                    getString(R.string.message_press_dislike), new Runnable() {
                        @Override
                        public void run() {
                            toggleFeedback(target, false);
                        }
                    });
            rows++;
            boolean speaking = item.id.equals(speakingId);
            menuRow(card, speaking ? R.drawable.ic_mute : R.drawable.ic_volume,
                    getString(speaking ? R.string.read_aloud_stop_label : R.string.read_aloud_start_label),
                    new Runnable() {
                        @Override
                        public void run() {
                            toggleSpeak(target);
                        }
                    });
            rows++;
        }

        menuRow(card, R.drawable.ic_share, getString(R.string.share), new Runnable() {
            @Override
            public void run() {
                share(target);
            }
        });
        rows++;
        if (!item.isUser()) {
            menuRow(card, R.drawable.ic_report, getString(R.string.message_press_report), new Runnable() {
                @Override
                public void run() {
                    toast(getString(R.string.ch_report_thanks));
                }
            });
            rows++;
        }

        int width = t.dp(190);
        final PopupWindow popup = new PopupWindow(card, width, ViewGroup.LayoutParams.WRAP_CONTENT, true);
        popup.setBackgroundDrawable(t.round(0x00000000, 14f));
        popup.setElevation(t.dp(8));
        popup.setOutsideTouchable(true);
        popup.setFocusable(true);
        popup.setOnDismissListener(new PopupWindow.OnDismissListener() {
            @Override
            public void onDismiss() {
                if (messageMenu == popup) messageMenu = null;
            }
        });
        messageMenu = popup;

        // 浮层贴住长按位置：先试手指下方，放不下再翻到上方，最后夹在屏幕内。
        int[] where = new int[2];
        anchor.getLocationOnScreen(where);
        int probe = menuTouchY > 0 ? menuTouchY : where[1] + anchor.getHeight() / 2;
        int screenW = getResources().getDisplayMetrics().widthPixels;
        int screenH = getResources().getDisplayMetrics().heightPixels;
        int x = item.isUser() ? where[0] + anchor.getWidth() - width : where[0];
        if (x < t.dp(8)) x = t.dp(8);
        if (x + width > screenW - t.dp(8)) x = screenW - t.dp(8) - width;
        int guess = rows * t.dp(44) + t.dp(12);
        int below = probe + t.dp(6);
        int above = probe - t.dp(6) - guess;
        int y = below + guess <= screenH - t.dp(8) ? below : Math.max(t.dp(8), above);
        popup.showAtLocation(anchor, Gravity.NO_GRAVITY, x, y);
    }

    /** 浮层里的一行：20dp 图标 + 10dp 间距 + 14sp 文字，行高 44dp，带水波纹。 */
    private void menuRow(LinearLayout card, int iconId, String label, final Runnable action) {
        LinearLayout row = t.row();
        row.setPadding(t.dp(14), 0, t.dp(14), 0);
        row.setBackground(t.ripple(10f));
        row.setClickable(true);
        ImageView icon = t.icon(iconId, t.text, 20);
        row.addView(icon);
        Theme.margin(icon, 0, 0, t.dp(10), 0);
        row.addView(t.text(label, 14f, t.text));
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dismissMessageMenu();
                action.run();
            }
        });
        card.addView(row, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(44)));
    }

    private void dismissMessageMenu() {
        if (messageMenu == null) return;
        PopupWindow popup = messageMenu;
        messageMenu = null;
        try {
            popup.dismiss();
        } catch (Exception error) {
            // 已经不在屏幕上了，忽略。
        }
    }

    /** 是不是最后一条用户消息：只有它能「修改」。 */
    private boolean isLastUserMessage(Item item) {
        String last = "";
        long seq = Long.MIN_VALUE;
        for (Item one : items.values()) {
            if (one.isUser() && one.seq >= seq) {
                seq = one.seq;
                last = one.id;
            }
        }
        return item.id.equals(last);
    }

    /** 修改：把正文塞回输入框，接着重新发。 */
    private void editMessage(Item item) {
        String text = item.body(this);
        input.setText(text == null ? "" : text);
        input.setSelection(input.getText().length());
        input.requestFocus();
        if (!item.pictures().isEmpty()) toast(getString(R.string.ch_edit_no_images));
    }

    /* ------------------------ 选择文本（独立选择面板） ------------------------ */

    private SelectSheet selectSheet;

    /**
     * 选择文本：从底部升起一块独立面板，里面是这条消息的可选择副本。
     *
     * 不在气泡上就地选的原因（实测踩过）：气泡在滚动列表里、高度常常超过一屏，
     * 系统的选择滑块会被列表边界和小兄弟视图抢走触摸，顶/底两端的滑块还会画到视图外面点不中；
     * 列表每次 SSE 重绘还会把正文视图整块换掉，选区随时消失。独立面板里只有这段文字，
     * 选词、拖两端滑块都是系统最标准的路径，也不会被重绘打断。
     */
    private void selectText(Item item) {
        String text = item.body(this);
        if (text == null || text.length() == 0) {
            toast(getString(R.string.select_text_empty));
            return;
        }
        if (selectSheet == null) selectSheet = new SelectSheet();
        selectSheet.open(item, text);
    }

    private void closeSelectSheet() {
        if (selectSheet != null) selectSheet.close();
    }

    private final class SelectSheet {
        private Dialog dialog;
        private TextView body;
        private TextView count;
        private TextView copyPill;
        private View sharePill;
        private ScrollView scroller;
        /** 复制药丸当前是否「可用」态：只在跨过 0 选区边界时重刷样式，避免每 120ms 重建 drawable。 */
        private boolean copyActive;
        private boolean open;

        void open(Item item, String text) {
            close();
            dialog = new Dialog(ChatActivity.this);
            dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

            LinearLayout card = t.column();
            card.setBackground(t.round(t.bg, 18f));
            card.addView(grabberView());

            LinearLayout head = t.row();
            head.setGravity(Gravity.CENTER_VERTICAL);
            head.setPadding(t.dp(18), t.dp(14), t.dp(8), t.dp(10));
            head.addView(t.strong(getString(R.string.message_select_text), 15f, t.text),
                    new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            FrameLayout closeIcon = t.iconButton(R.drawable.ic_close, t.muted, 18, 40);
            closeIcon.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    close();
                }
            });
            head.addView(closeIcon);
            card.addView(head);

            // 一句操作提示：面板里没有系统工具栏，得自己告诉用户怎么选（长按选词 / 拖两端手柄）。
            TextView hint = t.text(getString(R.string.select_text_hint), 12f, t.muted);
            hint.setPadding(t.dp(18), 0, t.dp(18), t.dp(10));
            card.addView(hint);
            card.addView(t.hairline());

            // 正文从布局里取：系统选择手柄的 drawable 只能靠 XML 属性挂上（没有运行时 API）。
            body = (TextView) LayoutInflater.from(ChatActivity.this)
                    .inflate(R.layout.select_sheet_body, null);
            body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f * t.fontScale);
            body.setTextColor(t.text);
            body.setIncludeFontPadding(false);
            body.setText(item.isUser() ? text : richText(text));
            body.setTextIsSelectable(true);
            body.setHighlightColor(Theme.alpha(t.accent, t.dark ? 0.34f : 0.22f));
            body.setCustomSelectionActionModeCallback(noSelectionToolbar);
            body.setLineSpacing(t.dp(2), 1f);
            // 底部多留一截：末端滑块要画在文字下面，留白不够就会跑到面板外点不中。
            body.setPadding(t.dp(18), t.dp(14), t.dp(18), t.dp(34));

            scroller = new ScrollView(ChatActivity.this);
            scroller.setFillViewport(true);
            scroller.addView(body, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
            card.addView(scroller, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
            card.addView(barView());

            dialog.setContentView(card);
            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                window.setDimAmount(0.35f);
                WindowManager.LayoutParams lp = new WindowManager.LayoutParams();
                lp.copyFrom(window.getAttributes());
                lp.width = WindowManager.LayoutParams.MATCH_PARENT;
                lp.height = Math.round(getResources().getDisplayMetrics().heightPixels * 0.84f);
                lp.gravity = Gravity.BOTTOM;
                window.setAttributes(lp);
                window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            }
            dialog.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
                @Override
                public void onDismiss(android.content.DialogInterface which) {
                    open = false;
                    ui.removeCallbacks(tick);
                }
            });
            open = true;
            dialog.show();
            body.post(new Runnable() {
                @Override
                public void run() {
                    if (!open) return;
                    body.requestFocus();
                    Spannable span = ensureSpannable(body);
                    // 打开时不预选：整段套上淡蓝底色既压住正文，也会让 TextView 把视口滚到末尾。
                    // 光标停在开头，用户长按选词或直接点「全选」，复制按钮的明暗跟着选区走。
                    if (span != null) Selection.setSelection(span, 0, 0);
                    updateCount();
                    topAtDelays();
                    ui.removeCallbacks(tick);
                    ui.post(tick);
                }
            });
        }

        void close() {
            open = false;
            ui.removeCallbacks(tick);
            Dialog closing = dialog;
            dialog = null;
            body = null;
            count = null;
            scroller = null;
            copyPill = null;
            sharePill = null;
            copyActive = false;
            if (closing != null) {
                try {
                    closing.dismiss();
                } catch (Exception error) {
                    // 已经关掉了，忽略。
                }
            }
        }

        /** 把正文滚回第一行：TextView 自带的滚动要单独归零，外层 ScrollView 归零不够。 */
        private void topAtDelays() {
            for (final long delay : new long[]{60, 180, 360}) {
                body.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (!open || body == null) return;
                        body.scrollTo(0, 0);
                        if (scroller != null) scroller.scrollTo(0, 0);
                    }
                }, delay);
            }
        }

        /** 顶部的小横条：告诉用户这是一块从底部升起、可以直接收走的面板。 */
        private View grabberView() {
            LinearLayout row = t.row();
            row.setGravity(Gravity.CENTER_HORIZONTAL);
            row.setPadding(0, t.dp(8), 0, 0);
            View bar = new View(ChatActivity.this);
            bar.setBackground(t.pill(Theme.alpha(t.text, 0.16f)));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(t.dp(36), t.dp(4));
            row.addView(bar, lp);
            return row;
        }

        /** 工具条：上面一条 hairline，左侧实时字数，右侧四个动作。 */
        private View barView() {
            LinearLayout wrap = t.column();
            wrap.setBackgroundColor(t.bg);
            wrap.addView(t.hairline());
            LinearLayout bar = t.row();
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setPadding(t.dp(14), t.dp(8), t.dp(10), t.dp(10));
            count = t.text("", 12f, t.muted);
            count.setSingleLine(true);
            bar.addView(count, new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            bar.addView(pill(getString(R.string.select_text_all), false, false, new Runnable() {
                @Override
                public void run() {
                    selectAll();
                }
            }));
            copyPill = pill(getString(R.string.message_press_copy), true, false, new Runnable() {
                @Override
                public void run() {
                    copySelection();
                }
            });
            // 0 选区不用半透明蓝底：白字压 #426EFE@50% 实测只有 2.0:1，看着像「坏掉的按钮」。
            // 改成中性底（tile）+ 灰字，视觉上就是一颗还没法按的按钮，选到字之后才变品牌色实底。
            copyPill.setTextColor(t.dark ? t.muted2 : t.muted);
            copyPill.setBackground(t.rippleOn(t.tile, 11f));
            bar.addView(copyPill);
            // 「分享」用图标：四个文字药丸在 393dp 宽的机器上会挤到字数标签。
            sharePill = pillIcon(R.drawable.ic_share, new Runnable() {
                @Override
                public void run() {
                    shareSelection();
                }
            });
            bar.addView(sharePill);
            bar.addView(pill(getString(R.string.select_text_done), false, true, new Runnable() {
                @Override
                public void run() {
                    close();
                }
            }));
            wrap.addView(bar);
            return wrap;
        }

        /** 一颗药丸：主操作（复制）用品牌色实底，accent=true 用品牌色文字（完成），其余是水波纹。 */
        private TextView pill(String label, boolean primary, boolean accent, final Runnable action) {
            TextView view = t.text(label, 12f, primary ? 0xFFFFFFFF : (accent ? t.accent : t.text));
            view.setGravity(Gravity.CENTER);
            view.setPadding(t.dp(12), t.dp(7), t.dp(12), t.dp(7));
            view.setBackground(primary ? t.rippleOn(t.accent, 11f) : t.ripple(11f));
            view.setClickable(true);
            view.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View clicked) {
                    action.run();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.leftMargin = t.dp(6);
            view.setLayoutParams(lp);
            return view;
        }

        /** 图标动作（分享）：34dp 触摸位里放 18dp 图标，视觉重量和文字药丸对齐。 */
        private View pillIcon(int iconId, final Runnable action) {
            View view = t.iconButton(iconId, t.text, 18, 34);
            view.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View clicked) {
                    action.run();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.leftMargin = t.dp(2);
            view.setLayoutParams(lp);
            return view;
        }

        /** 系统没有「选区变化」回调，面板开着时每 120ms 刷一次字数。 */
        private final Runnable tick = new Runnable() {
            @Override
            public void run() {
                if (!open) return;
                updateCount();
                ui.postDelayed(this, 120);
            }
        };

        private void updateCount() {
            if (count == null || body == null) return;
            int total = body.getText() == null ? 0 : body.getText().length();
            int start = body.getSelectionStart();
            int end = body.getSelectionEnd();
            int picked = start < 0 || end < 0 ? total : Math.abs(end - start);
            // 只在值真的变了才写：每 120ms 无条件 setText 会让界面永远处于「有变化」状态，
            // 无障碍 / 自动化拿不到 idle（实测 uiautomator dump 直接报 could not get idle state）。
            String label = getString(R.string.select_text_count, picked, total);
            if (!label.contentEquals(count.getText())) count.setText(label);
            // 一个字都没选时把「复制」切成中性底灰字：面板里没有系统工具栏，按钮状态就是唯一提示。
            // 半透明蓝底（旧做法）在浅色下是白字压 #A1B7FE = 2.0:1，深色下是灰字压 #304580 = 1.6:1，都糊。
            boolean active = picked > 0;
            if (copyPill != null && active != copyActive) {
                copyActive = active;
                copyPill.setTextColor(active ? 0xFFFFFFFF : (t.dark ? t.muted2 : t.muted));
                copyPill.setBackground(active ? t.rippleOn(t.accent, 11f) : t.rippleOn(t.tile, 11f));
            }
            float alpha = active ? 1f : 0.5f;
            // 一个字都没选时「分享」也没东西可发，一起压暗，两个动作的可用性保持一致。
            if (sharePill != null && sharePill.getAlpha() != alpha) sharePill.setAlpha(alpha);
        }

        private void selectAll() {
            if (body == null) return;
            Spannable span = ensureSpannable(body);
            if (span != null) Selection.setSelection(span, 0, span.length());
            updateCount();
            topAtDelays();
        }

        private void copySelection() {
            String text = selectionText(body);
            if (text.length() == 0) {
                toast(getString(R.string.select_text_pick));
                return;
            }
            ClipboardManager manager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            manager.setPrimaryClip(ClipData.newPlainText("message", text));
            toast(getString(R.string.select_text_copied, text.length()));
        }

        private void shareSelection() {
            String text = selectionText(body);
            if (text.length() == 0) {
                toast(getString(R.string.select_text_pick));
                return;
            }
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            try {
                startActivity(Intent.createChooser(send, getString(R.string.share)));
            } catch (Exception error) {
                toast(getString(R.string.ch_share_no_target));
            }
        }
    }

    /**
     * 取正文的 Spannable 版本（没有就换成一个）。
     *
     * 选区必须落在 Spannable 上（Selection.setSelection / getSelectionStart 都按这个来），
     * 而 TextView 的纯文本常常只是 String。SpannableString 会带上原有 span，
     * 所以助手消息里的代码底色、加粗之类进选择面板不会掉样式。
     */
    private Spannable ensureSpannable(TextView view) {
        if (view == null) return null;
        CharSequence text = view.getText();
        if (text instanceof Spannable) return (Spannable) text;
        SpannableString copy = new SpannableString(text == null ? "" : text);
        view.setText(copy);
        return copy;
    }

    /** 选中的那一段；一个字符都没选到时返回空串（不偷偷拿整段）。 */
    private String selectionText(TextView view) {
        if (view == null || view.getText() == null) return "";
        CharSequence all = view.getText();
        int start = view.getSelectionStart();
        int end = view.getSelectionEnd();
        if (start < 0 || end < 0) return "";
        if (start > end) {
            int swap = start;
            start = end;
            end = swap;
        }
        if (start == end) return "";
        return all.subSequence(start, end).toString();
    }

    /**
     * 接管系统的选择浮条：**动作模式照常开始，但把它的菜单清空**。
     *
     * onCreateActionMode 返回 false 时系统会以为浮条没起来，把选区收成一根光标、滑块也不给；
     * 完全不接管又会同时出现系统浮条和面板自己的工具条。返回 true + 清空 menu：
     * 选区与滑块归系统（拖得动），浮条因为没有菜单项而不显示，工具栏只用面板下面那一条。
     */
    private final ActionMode.Callback noSelectionToolbar = new ActionMode.Callback() {
        @Override
        public boolean onCreateActionMode(ActionMode mode, android.view.Menu menu) {
            menu.clear();
            return true;
        }

        @Override
        public boolean onPrepareActionMode(ActionMode mode, android.view.Menu menu) {
            menu.clear();
            return true;
        }

        @Override
        public boolean onActionItemClicked(ActionMode mode, android.view.MenuItem item) {
            return false;
        }

        @Override
        public void onDestroyActionMode(ActionMode mode) {
            // 空菜单浮条，退出时没有额外状态要清。
        }
    };

    /* ---------------------------- 朗读（TTS） ---------------------------- */

    private static final String CODE_TICK = String.valueOf((char) 96);
    private static final String CODE_FENCE = CODE_TICK + CODE_TICK + CODE_TICK;

    /** 朗读 / 停止朗读这条消息。 */
    private void toggleSpeak(final BarTarget target) {
        if (target.id.equals(speakingId)) {
            stopSpeak();
            return;
        }
        if (speechText(this, target.text).length() == 0) {
            toast(getString(R.string.ch_speak_empty));
            return;
        }
        if (ttsBroken) {
            toast(getString(R.string.ch_speak_no_engine));
            return;
        }
        if (tts == null) {
            // 设备根本没装语音引擎时，TextToSpeech 构造出来也不会回调 onInit，先问一遍再决定。
            if (!hasTtsEngine()) {
                ttsBroken = true;
                toast(getString(R.string.ch_speak_no_engine));
                return;
            }
            ttsDestroyed = false;
            tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int state) {
                    handleTtsInit(state, target);
                }
            });
            ui.removeCallbacks(ttsWatchdog);
            ui.postDelayed(ttsWatchdog, 2000);
            return;
        }
        if (!ttsReady) {
            toast(getString(R.string.ch_speak_engine_starting));
            return;
        }
        startSpeak(target);
    }

    /** 问系统有没有可用的 TTS 引擎（问不到就当作有，让 TextToSpeech 自己去试）。 */
    private boolean hasTtsEngine() {
        try {
            android.content.Intent probe =
                    new android.content.Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE);
            java.util.List<android.content.pm.ResolveInfo> found =
                    getPackageManager().queryIntentServices(probe, 0);
            return found != null && !found.isEmpty();
        } catch (Exception error) {
            return true;
        }
    }

    private void handleTtsInit(final int state, final BarTarget target) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                ui.removeCallbacks(ttsWatchdog);
                if (ttsDestroyed) {
                    releaseTts();
                    return;
                }
                if (tts == null) {
                    // 引擎刚被 releaseTts() 收走（比如点完朗读就切后台），这里安静退出。
                    return;
                }
                if (state != TextToSpeech.SUCCESS) {
                    ttsBroken = true;
                    releaseTts();
                    toast(getString(R.string.read_aloud_unavailable));
                    return;
                }
                int lang = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
                if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                    lang = tts.setLanguage(Locale.CHINESE);
                }
                if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
                    ttsBroken = true;
                    releaseTts();
                    toast(getString(R.string.read_aloud_unavailable));
                    return;
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String id) {
                    }

                    @Override
                    public void onDone(String id) {
                        finishSpeak(id);
                    }

                    @Override
                    public void onError(String id) {
                        finishSpeak(id);
                    }
                });
                ttsReady = true;
                startSpeak(target);
            }
        });
    }

    private void startSpeak(BarTarget target) {
        if (tts == null || !ttsReady) return;
        String text = speechText(this, target.text);
        if (text.length() == 0) return;
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "chat-" + target.id);
        if (result != TextToSpeech.SUCCESS) {
            toast(getString(R.string.read_aloud_unavailable));
            return;
        }
        speakingId = target.id;
        refreshBars();
    }

    private void finishSpeak(final String utterance) {
        final String tagged = "chat-" + speakingId;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (utterance == null || utterance.equals(tagged)) {
                    speakingId = "";
                    refreshBars();
                }
            }
        });
    }

    private void stopSpeak() {
        if (tts != null && ttsReady) {
            try {
                tts.stop();
            } catch (Exception error) {
                // 引擎已经没了，忽略。
            }
        }
        speakingId = "";
        refreshBars();
    }

    /** 放掉引擎：onPause / onDestroy 都走这里，下次点朗读再懒创建。 */
    private void releaseTts() {
        ui.removeCallbacks(ttsWatchdog);
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception error) {
                // 忽略。
            }
            try {
                tts.shutdown();
            } catch (Exception error) {
                // 忽略。
            }
            tts = null;
        }
        ttsReady = false;
        speakingId = "";
    }

    /** 朗读用的纯文本：把 markdown 记号抹掉，别把星号念出来。 */
    private static String speechText(Context context, String raw) {
        if (raw == null) return "";
        String text = raw.replace(CODE_FENCE, " " + context.getString(R.string.ch_tts_code_block) + " ")
                .replace(CODE_TICK, "");
        StringBuilder flat = new StringBuilder(text.length());
        int i = 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (c == '*' || c == '_' || c == '~') {
                i++;
                continue;
            }
            if (c == '!' && i + 1 < text.length() && text.charAt(i + 1) == '[') {
                i++;
                continue;
            }
            if (c == '[') {
                i++;
                continue;
            }
            if (c == ']') {
                if (i + 1 < text.length() && text.charAt(i + 1) == '(') {
                    int close = text.indexOf(')', i + 1);
                    i = close < 0 ? text.length() : close + 1;
                } else {
                    i++;
                }
                continue;
            }
            flat.append(c);
            i++;
        }
        StringBuilder out = new StringBuilder(flat.length());
        for (String line : flat.toString().split("\n")) {
            String each = line.trim();
            while (each.length() > 0) {
                char head = each.charAt(0);
                if (head == '#' || head == '-' || head == '>' || head == '+') each = each.substring(1).trim();
                else break;
            }
            if (each.length() == 0) continue;
            if (out.length() > 0) out.append('，');
            out.append(each);
        }
        return out.toString();
    }

    /** 复制一条消息：有字就复制字，只有图就复制 attachmentId。 */
    private void copyMessage(BarTarget target) {
        String text = target.text;
        if (text == null || text.length() == 0) {
            List<Item.ImageRef> pictures = target.pictures;
            if (pictures.isEmpty()) {
                toast(getString(R.string.ch_copy_empty));
                return;
            }
            StringBuilder sb = new StringBuilder();
            for (Item.ImageRef ref : pictures) {
                if (sb.length() > 0) sb.append("\n");
                sb.append("attachment://").append(ref.attachmentId);
            }
            copy(sb.toString());
            return;
        }
        copy(text);
    }

    private String markdown(Item item) {
        StringBuilder sb = new StringBuilder();
        String text = item.body(this);
        if (text != null && text.length() > 0) sb.append(text);
        for (Item.ImageRef ref : item.pictures()) {
            if (sb.length() > 0) sb.append("\n\n");
            sb.append("![").append(ref.name.length() == 0 ? "image" : ref.name).append("](attachment://")
                    .append(ref.attachmentId).append(")");
        }
        return sb.toString();
    }

    /**
     * 重发：把这条消息（文字 + 当时带的那几张图）原样再发一次。
     *
     * 图片在 host 侧是 attachment 对象，手机只存了 attachmentId，
     * 所以要按 /v1/sessions/{id}/image/{attachmentId} 把字节取回来再 base64。
     * 取图是同步网络请求，丢到 api 的线程池里做，不堵 UI。
     */
    private void resend(final Item item) {
        final String text = item.body(this) == null ? "" : item.body(this);
        final List<Item.ImageRef> pictures = item.pictures();
        if (text.length() == 0 && pictures.isEmpty()) {
            toast(getString(R.string.ch_resend_empty));
            return;
        }
        if ("running".equals(status)) {
            toast(getString(R.string.ch_resend_running));
            return;
        }
        toast(getString(R.string.ch_resending));
        setStatus("running");
        api.pool().execute(new Runnable() {
            @Override
            public void run() {
                final List<Pick.Pending> outgoing = new ArrayList<Pick.Pending>();
                String failure = null;
                for (Item.ImageRef ref : pictures) {
                    try {
                        byte[] raw = api.bytes(Img.path(sessionId, ref.attachmentId));
                        outgoing.add(Pick.Pending.of(raw, ref.mediaType, ref.name, ref.width, ref.height));
                    } catch (Exception error) {
                        failure = Api.message(error);
                        break;
                    }
                }
                final String error = failure;
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        setStatus("idle");
                        if (error != null) {
                            toast(getString(R.string.ch_resend_image_failed, error));
                            return;
                        }
                        deliver(text, outgoing);
                    }
                });
            }
        });
    }

    private void copy(String text) {
        if (text == null) text = "";
        setClipboard(text);
        toast(getString(R.string.ch_copied));
    }

    /** 只写剪贴板、不提示：分享没有落地应用时用它兜底。 */
    private void setClipboard(String text) {
        try {
            ClipboardManager manager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            manager.setPrimaryClip(ClipData.newPlainText("message", text == null ? "" : text));
        } catch (Exception error) {
            // 个别系统把剪贴板服务关掉了，忽略。
        }
    }

    private void sessionMenu() {
        final String[] labels = new String[] {
                getString(R.string.ch_menu_rename), getString(R.string.ch_menu_refresh),
                getString(R.string.ch_menu_copy_id) };
        new AlertDialog.Builder(this)
                .setItems(labels, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        if (which == 0) rename();
                        else if (which == 1) load();
                        else copy(sessionId);
                    }
                })
                .show();
    }

    private void rename() {
        final EditText field = new EditText(this);
        field.setText(title == null ? "" : title);
        field.setSingleLine(true);
        field.setTextColor(t.text);
        field.setHintTextColor(t.muted);
        int pad = t.dp(18);
        field.setPadding(pad, pad, pad, pad);
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.ch_rename_title))
                .setView(field)
                .setPositiveButton(getString(R.string.ch_save),
                        new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        String next = field.getText().toString().trim();
                        if (next.length() == 0) return;
                        JSONObject body = new JSONObject();
                        try {
                            body.put("title", next);
                        } catch (Exception ignore) {
                        }
                        api.post("/v1/sessions/" + Api.enc(sessionId) + "/rename", body, new Api.Callback() {
                            @Override
                            public void onOk(JSONObject result) {
                                ui.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        title = next;
                                        titleView.setText(next);
                                        toast(getString(R.string.ch_renamed));
                                    }
                                });
                            }

                            @Override
                            public void onError(final String message) {
                                ui.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        toast(getString(R.string.ch_rename_failed, message));
                                    }
                                });
                            }
                        });
                    }
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    /* ------------------------------------------------------------------ */
    /* 审批 / 反问                                                        */
    /* ------------------------------------------------------------------ */

    private void showApproval(JSONObject data) {
        if (data == null) return;
        final String eventId = data.optString("eventId", "");
        if (eventId.length() == 0) return;
        if (!"open".equals(data.optString("status", "open"))) {
            noticeRow.setVisibility(View.GONE);
            return;
        }
        String toolName = data.optString("toolName", getString(R.string.ch_tool_unknown));
        String reason = data.optString("reason", "");
        noticeRow.setVisibility(View.VISIBLE);
        noticeRow.removeAllViews();
        LinearLayout text = t.column();
        text.addView(t.text(getString(R.string.ch_approval_prefix, toolName), 12f, t.warn));
        if (reason.length() > 0) {
            TextView detail = t.text(reason, 11f, t.muted);
            detail.setMaxLines(2);
            detail.setEllipsize(TextUtils.TruncateAt.END);
            text.addView(detail);
        }
        noticeRow.addView(text, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView allow = t.strong(getString(R.string.ch_approval_allow), 12f, t.ok);
        allow.setPadding(t.dp(10), t.dp(6), t.dp(10), t.dp(6));
        allow.setClickable(true);
        noticeRow.addView(allow);
        TextView deny = t.text(getString(R.string.ch_approval_deny), 12f, t.bad);
        deny.setPadding(t.dp(10), t.dp(6), t.dp(4), t.dp(6));
        deny.setClickable(true);
        noticeRow.addView(deny);
        allow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                answerApproval(eventId, "allow-once");
            }
        });
        deny.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                answerApproval(eventId, "reject");
            }
        });
    }

    private void answerApproval(final String eventId, String action) {
        JSONObject body = new JSONObject();
        try {
            body.put("eventId", eventId);
            body.put("action", action);
        } catch (Exception ignore) {
        }
        noticeRow.setVisibility(View.GONE);
        api.post("/v1/sessions/" + Api.enc(sessionId) + "/answer", body, new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_approval_done));
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_approval_failed, message));
                    }
                });
            }
        });
    }

    /** 模型反问：铺在消息流上方，多选题可多选，全部选完一起提交。 */
    private void showQuestion(JSONObject data) {
        if (data == null) return;
        String eventId = data.optString("eventId", "");
        JSONArray questions = data.optJSONArray("questions");
        if (eventId.length() == 0 || questions == null || questions.length() == 0) return;

        if (!"open".equals(data.optString("status", "open"))) {
            // 已回答 / 已失效：只有正展示的就是它才收起，避免别的会话的问题盖掉当前卡片。
            if (eventId.equals(sheetEventId)) clearSheet();
            return;
        }
        if (!eventId.equals(sheetEventId) || sheetQuestions == null) {
            sheetEventId = eventId;
            sheetQuestions = questions;
            sheetPicks.clear();
            for (int index = 0; index < questions.length(); index++) {
                sheetPicks.add(new ArrayList<String>());
            }
        }
        renderSheet();
    }

    private void clearSheet() {
        sheetEventId = null;
        sheetQuestions = null;
        sheetPicks.clear();
        // 判定不变：sheetEventId=null 仍是「面板该消失」的唯一来源；只是把「清空 + 隐藏」挪到淡出结束，
        // 好让退场的是整张卡片而不是一个已经空掉的容器。守卫用同一个 sheetEventId。
        Motion.cancel(questionRow);
        Motion.fadeOut(questionRow, Motion.DUR_TOGGLE, new Runnable() {
            @Override
            public void run() {
                if (sheetEventId == null) {
                    questionRow.removeAllViews();
                    questionRow.setVisibility(View.GONE);
                }
            }
        }).start();
    }

    private void renderSheet() {
        if (sheetEventId == null || sheetQuestions == null) {
            clearSheet();
            return;
        }
        boolean wasShowing = questionRow.getVisibility() == View.VISIBLE;
        questionRow.removeAllViews();
        questionRow.setVisibility(View.VISIBLE);
        Motion.cancel(questionRow);
        if (!wasShowing || questionRow.getAlpha() < 1f) {
            questionRow.setAlpha(0f);
            Motion.fadeIn(questionRow, Motion.DUR_TOGGLE).start();
        }
        questionRow.setBackgroundColor(0x00000000);

        // 底部卡片形式的问答面板：宽度跟屏幕，高度封顶，
        // 否则问题一多就把聊天流挤成 0 高。
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surfaceAlt, 18f));
        card.setPadding(t.dp(16), t.dp(12), t.dp(16), t.dp(12));
        Theme.margin(card, t.dp(12), t.dp(8), t.dp(12), t.dp(6));
        questionRow.addView(card, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout head = t.row();
        head.addView(t.strong(getString(R.string.question_header), 12f, t.accent),
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView ignore = t.text(getString(R.string.question_ignore), 12f, t.muted);
        ignore.setPadding(t.dp(10), t.dp(2), t.dp(2), t.dp(2));
        ignore.setClickable(true);
        ignore.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                clearSheet();
            }
        });
        head.addView(ignore);
        card.addView(head);

        LinearLayout body = t.column();
        for (int index = 0; index < sheetQuestions.length(); index++) {
            final int slot = index;
            final JSONObject question = sheetQuestions.optJSONObject(index);
            if (question == null) continue;
            final boolean multi = question.optBoolean("multi_select", false);
            final List<String> picked = sheetPicks.get(index);
            String header = question.optString("header", "");
            String prompt = question.optString("question", getString(R.string.ch_question_default));
            String caption = header.length() > 0 && captionFree(header, prompt) ? header + " · " + prompt : prompt;
            TextView title = t.strong(caption, 14f, t.text);
            Theme.margin(title, 0, index == 0 ? t.dp(10) : t.dp(16), 0, t.dp(6));
            body.addView(title);

            JSONArray options = question.optJSONArray("options");
            if (options == null) continue;
            Flow chips = new Flow(this, t.dp(8), t.dp(8));
            for (int slotOption = 0; slotOption < options.length(); slotOption++) {
                JSONObject option = options.optJSONObject(slotOption);
                if (option == null) continue;
                final String label = option.optString("label", "");
                if (label.length() == 0) continue;
                final boolean on = picked.contains(label);
                TextView chip = t.text(label, 13f, on ? t.accent : t.text);
                chip.setPadding(t.dp(14), t.dp(8), t.dp(14), t.dp(8));
                chip.setBackground(t.roundStroke(on ? t.accentSoft : t.surface,
                        on ? t.accent : t.line, 12f));
                chip.setClickable(true);
                chip.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        if (slot >= sheetPicks.size()) return;
                        List<String> current = sheetPicks.get(slot);
                        if (multi) {
                            if (current.contains(label)) current.remove(label);
                            else current.add(label);
                        } else {
                            current.clear();
                            current.add(label);
                        }
                        renderSheet();
                    }
                });
                chips.addView(chip);
            }
            Theme.margin(chips, 0, t.dp(6), 0, 0);
            body.addView(chips, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        int maxBox = Math.max(t.dp(180), (getResources().getDisplayMetrics().heightPixels * 2) / 5);
        MaxScroll box = new MaxScroll(this, maxBox);
        box.addView(body);
        card.addView(box, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout foot = t.row();
        foot.setGravity(Gravity.END);
        Theme.margin(foot, 0, t.dp(10), 0, 0);
        TextView skip = t.text(getString(R.string.question_skip_all), 13f, t.muted);
        skip.setPadding(t.dp(10), t.dp(6), t.dp(10), t.dp(6));
        skip.setClickable(true);
        skip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                for (List<String> each : sheetPicks) each.clear();
                submitSheet();
            }
        });
        foot.addView(skip);

        TextView submit = t.text(getString(R.string.question_answer), 13f, t.onAccent);
        submit.setPadding(t.dp(20), t.dp(8), t.dp(20), t.dp(8));
        submit.setBackground(t.round(t.accent, 16f));
        submit.setClickable(true);
        Theme.margin(submit, t.dp(8), 0, 0, 0);
        submit.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                submitSheet();
            }
        });
        foot.addView(submit);
        card.addView(foot);
    }

    /** 问题标题和分组名重复时只显示一个。 */
    private static boolean captionFree(String header, String prompt) {
        return !header.equalsIgnoreCase(prompt) && !prompt.startsWith(header);
    }

    private void submitSheet() {
        final String eventId = sheetEventId;
        if (eventId == null || sheetQuestions == null) return;
        JSONObject body = new JSONObject();
        try {
            body.put("eventId", eventId);
            JSONArray answers = new JSONArray();
            for (int index = 0; index < sheetQuestions.length(); index++) {
                JSONObject question = sheetQuestions.optJSONObject(index);
                if (question == null) continue;
                JSONObject answer = new JSONObject();
                answer.put("id", question.optString("id", ""));
                JSONArray selected = new JSONArray();
                if (index < sheetPicks.size()) {
                    for (String label : sheetPicks.get(index)) selected.put(label);
                }
                answer.put("selected", selected);
                answers.put(answer);
            }
            body.put("answers", answers);
        } catch (Exception ignore) {
        }
        clearSheet();
        setStatus("running");
        api.post("/v1/sessions/" + Api.enc(sessionId) + "/question", body, new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_answer_done));
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_answer_failed, message));
                        loadOpenQuestions();
                    }
                });
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* 附件                                                              */
    /* ------------------------------------------------------------------ */

    private void choose() {
        if (pending.size() >= Pick.maxImages()) {
            toast(getString(R.string.ch_image_limit, Pick.maxImages()));
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        try {
            startActivityForResult(intent, REQ_PICK);
        } catch (android.content.ActivityNotFoundException error) {
            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
            fallback.setType("image/*");
            startActivityForResult(fallback, REQ_PICK);
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_SHOT) {
            if (result == RESULT_OK && shotFile != null && shotFile.length() > 0) {
                accept(Shot.uriFor(shotFile));
            } else if (result == RESULT_OK) {
                toast(getString(R.string.composer_camera_note));
            }
            return;
        }
        if (request == REQ_ASR) {
            if (result != RESULT_OK || data == null) return;
            ArrayList<String> heard = data.getStringArrayListExtra(
                    android.speech.RecognizerIntent.EXTRA_RESULTS);
            if (heard == null || heard.isEmpty()) {
                toast(getString(R.string.composer_voice_note));
                return;
            }
            voiceMode = false;
            renderInputMode();
            input.setText(heard.get(0));
            input.setSelection(input.getText().length());
            input.requestFocus();
            return;
        }
        if (request == REQ_FILE) {
            if (result != RESULT_OK || data == null || data.getData() == null) return;
            String type = getContentResolver().getType(data.getData());
            if (type != null && type.startsWith("image/")) accept(data.getData());
            else toast(getString(R.string.composer_file_note));
            return;
        }
        if (request != REQ_PICK || result != RESULT_OK || data == null || data.getData() == null) return;
        accept(data.getData());
    }

    /** 把选中的图片读成待发附件（相册、拍照共用）。 */
    private void accept(final android.net.Uri uri) {
        toast(getString(R.string.ch_reading_image));
        Pick.read(this, uri, new Pick.Callback() {
            @Override
            public void onOk(final Pick.Pending item) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (pending.size() >= Pick.maxImages()) {
                            toast(getString(R.string.ch_image_limit, Pick.maxImages()));
                            return;
                        }
                        pending.add(item);
                        renderStrip();
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_image_unreadable, message));
                    }
                });
            }
        });
    }

    private void renderStrip() {
        // 显隐判定完全不变：只看 pending 是否为空。动画只加在「首次出现」与「最后一个被移除」两端。
        boolean wasShowing = attachStrip.getVisibility() == View.VISIBLE;
        attachStrip.removeAllViews();
        if (pending.isEmpty()) {
            if (wasShowing) {
                Motion.fadeOut(attachStrip, Motion.DUR_TOGGLE, new Runnable() {
                    @Override
                    public void run() {
                        if (pending.isEmpty()) attachStrip.setVisibility(View.GONE);
                    }
                }).start();
            } else {
                attachStrip.setVisibility(View.GONE);
            }
            return;
        }
        attachStrip.setVisibility(View.VISIBLE);
        // 退场动画可能还在跑：先取消（否则它会把 alpha 一路走到 0，条子明明 VISIBLE 却看不见）。
        Motion.cancel(attachStrip);
        if (!wasShowing || attachStrip.getAlpha() < 1f) {
            attachStrip.setAlpha(0f);
            Motion.fadeIn(attachStrip, Motion.DUR_TOGGLE).start();
        }
        for (int index = 0; index < pending.size(); index++) {
            final int slot = index;
            final Pick.Pending item = pending.get(index);
            LinearLayout cell = t.row();
            cell.setPadding(t.dp(10), t.dp(6), t.dp(6), t.dp(6));
            cell.setBackground(t.round(t.surfaceAlt, 12f));
            Theme.margin(cell, 0, 0, t.dp(8), 0);
            TextView name = t.text(item.name.length() > 0 ? item.name : getString(R.string.ch_image_placeholder), 11f, t.text);
            name.setMaxLines(1);
            name.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            name.setMaxWidth(t.dp(120));
            cell.addView(name);
            LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(t.dp(26), t.dp(26));
            closeLp.leftMargin = t.dp(4);
            FrameLayout close = t.iconButton(R.drawable.ic_close, t.muted, 12, 26);
            close.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    if (slot < pending.size()) pending.remove(slot);
                    renderStrip();
                }
            });
            cell.addView(close, closeLp);
            attachStrip.addView(cell);
        }
    }

    /* ------------------------------------------------------------------ */
    /* 发送 / 打断                                                        */
    /* ------------------------------------------------------------------ */

    private void send() {
        final String text = input.getText().toString().trim();
        final List<Pick.Pending> sending = new ArrayList<Pick.Pending>(pending);
        if (text.length() == 0 && sending.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (now - lastSendAt < 500L) return;
        lastSendAt = now;
        input.setText("");
        pending.clear();
        renderStrip();
        deliver(text, sending);
    }

    /** 真正发一条消息：文字 + 若干张图。send() 与「重发」都走这里。 */
    private void deliver(final String text, final List<Pick.Pending> sending) {
        long now = System.currentTimeMillis();
        JSONObject body = new JSONObject();
        try {
            body.put("text", text);
            body.put("requestId", "android-" + now);
            String model = Seats.modelId(prefs);
            if (model.length() > 0) body.put("model", model);
            String permission = Seats.permission(prefs);
            if (permission.length() > 0) body.put("permission", permission);
            String effort = Seats.effort(prefs);
            if (effort.length() > 0) body.put("reasoning", effort);
            if (!sending.isEmpty()) {
                JSONArray images = new JSONArray();
                for (Pick.Pending item : sending) {
                    JSONObject image = new JSONObject();
                    image.put("mediaType", item.mediaType);
                    image.put("data", item.data);
                    image.put("name", item.name);
                    images.put(image);
                }
                body.put("images", images);
            }
        } catch (Exception ignore) {
        }
        setSendEnabled(false);
        setStatus("running");
        api.post("/v1/sessions/" + Api.enc(sessionId) + "/messages", body, new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        setSendEnabled(true);
                        setStatus("running");
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        setSendEnabled(true);
                        if (text != null && text.length() > 0 && input.getText().length() == 0) {
                            input.setText(text);
                            input.setSelection(input.getText().length());
                        }
                        if (!sending.isEmpty() && pending.isEmpty()) {
                            pending.addAll(sending);
                            renderStrip();
                        }
                        setStatus("idle");
                        toast(getString(R.string.ch_send_failed, message));
                    }
                });
            }
        });
    }

    private void setSendEnabled(boolean enabled) {
        if (actionButton != null) {
            actionButton.setEnabled(enabled);
            actionButton.setAlpha(enabled ? 1f : 0.45f);
        }
        if (uploadButton != null) uploadButton.setEnabled(enabled);
    }

    private void interrupt() {
        api.post("/v1/sessions/" + Api.enc(sessionId) + "/interrupt", new JSONObject(), new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        setStatus("idle");
                        toast(getString(R.string.ch_interrupted));
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.ch_interrupt_failed, message));
                    }
                });
            }
        });
    }

    /* ---------------- 官方风格的欢迎页 / 开关 / 模型 ---------------- */

    /** 空会话：官方「今天有什么可以帮到你？」+ 建议词。 */
    private View welcome() {
        LinearLayout box = t.column();
        // 官方空会话与首页同一套欢迎版式：鲸形在屏高约 37% 处，问候语紧随其下。
        box.setPadding(0, t.dp(150), 0, 0);

        // 品牌徽章为方形圆形线稿，等比放在 34x34dp 里（不拉伸）。
        LinearLayout logoRow = t.row();
        logoRow.setGravity(Gravity.CENTER);
        ImageView logo = new ImageView(this);
        logo.setImageResource(t.brandLogo());
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logoRow.addView(logo, new LinearLayout.LayoutParams(t.dp(34), t.dp(34)));
        box.addView(logoRow);

        // 官方这句是 17sp 中等偏粗，20sp 会显得比模板“重”。
        TextView hello = t.strong(getString(R.string.home_greeting), 17f, t.text);
        hello.setGravity(Gravity.CENTER);
        Theme.margin(hello, 0, t.dp(14), 0, 0);
        box.addView(hello);

        // 官方空会话页只有鲸形 + 问候语，没有建议词胶囊（建议词仍保留字符串资源，
        // 供未来「引导词」入口复用）。
        return box;
    }

    /** 欢迎页的建议词胶囊。 */
    private View tipChip(final String tip) {
        TextView chip = t.text(tip, 13f, t.text);
        chip.setPadding(t.dp(18), t.dp(10), t.dp(18), t.dp(10));
        chip.setBackground(t.roundStroke(t.surface, t.line, 20f));
        chip.setClickable(true);
        chip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                input.setText(tip);
                input.setSelection(input.getText().length());
            }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = t.dp(5);
        lp.rightMargin = t.dp(5);
        chip.setLayoutParams(lp);
        return chip;
    }

    /** 从 /v1/catalog 拿模型清单 / 默认权限 / 推理等级，座位 chip 都靠它。 */
    private void loadCatalog() {
        api.get("/v1/catalog", new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                Seats.apply(body);
                final List<String> cwds = new ArrayList<String>();
                final List<String> names = new ArrayList<String>();
                JSONArray workspaces = body.optJSONArray("workspaces");
                if (workspaces != null) {
                    for (int index = 0; index < workspaces.length(); index++) {
                        JSONObject entry = workspaces.optJSONObject(index);
                        if (entry == null) continue;
                        String dir = entry.optString("cwd", "");
                        if (dir.length() == 0) continue;
                        cwds.add(dir);
                        names.add(entry.optString("title", dir));
                    }
                }
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        renderChips();
                        // 抽屉的工作区 chips 与首页同一份目录表：/v1/catalog 的 workspaces。
                        drawerWsCwds.clear();
                        drawerWsNames.clear();
                        drawerWsCwds.addAll(cwds);
                        drawerWsNames.addAll(names);
                        if (drawerWs.length() > 0 && !containsDir(drawerWs)) drawerWs = "";
                        renderDrawerHead();
                        renderDrawer();
                    }
                });
            }

            @Override
            public void onError(String message) {
            }
        });
    }

    /** 重新生成：重发这条操作条所在那一轮的用户消息（无参数时退回最后一轮）。 */
    private void regenerate() {
        regenerate(null);
    }

    /**
     * 重新生成：操作条挂在哪一轮，就重发那一轮的用户消息。
     *
     * target 为 null、或它之前没有用户消息（比如会话只加载了后半段）时，退回「最后一条用户消息」，
     * 与原实现完全一致 —— 这样任何一条生成结果上的「重新生成」都能找到对应的提问。
     */
    private void regenerate(BarTarget target) {
        Item lastUser = null;
        if (target != null) {
            for (Item one : items.values()) {
                if (!one.isUser()) continue;
                if (target.seq > 0 && one.seq >= target.seq) continue;
                if (lastUser == null || one.seq >= lastUser.seq) lastUser = one;
            }
        }
        if (lastUser == null) {
            for (Item one : items.values()) {
                if (!one.isUser()) continue;
                if (lastUser == null || one.seq >= lastUser.seq) lastUser = one;
            }
        }
        if (lastUser == null) {
            toast(getString(R.string.ch_regenerate_empty));
            return;
        }
        resend(lastUser);
    }

    /* ------------------------------------------------------------------ */
    /* 历史抽屉                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * 抽屉面板：顶栏（搜索胶囊 + 工作区 chips）· 分组会话列表 · 底栏（谁在用这台电脑 / ⋯）。
     *
     * 与首页抽屉（MainActivity.drawerBody）逐栏对齐：同一条 38dp 搜索胶囊、同一排工作区 chips、
     * 同一条 34dp 圆头像的用户栏。原来那行「会话」标题 + 右上 ⊕ 去掉了 —— ⊕ 和顶栏的新建键
     * （ic_new_chat）本来就是同一个动作（closeWithPop），标题在这页没有信息量。
     * 数据与首页抽屉同一个接口（GET /v1/sessions），这里只读。
     */
    private LinearLayout drawerBody() {
        LinearLayout panel = t.column();
        panel.setBackgroundColor(t.surface);
        panel.setClickable(true);

        drawerHeadBox = t.column();
        panel.addView(drawerHeadBox);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        drawerList = t.column();
        drawerList.setPadding(t.dp(8), 0, t.dp(8), t.dp(16));
        scroll.addView(drawerList);
        panel.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        drawerUserBox = drawerUserRow();
        panel.addView(drawerUserBox);
        applyDrawerUser(Me.displayName(prefs), Me.avatar(this, prefs));

        renderDrawerHead();
        return panel;
    }

    private void openDrawer() {
        if (drawerPanel == null || drawerOpen) return;
        drawerOpen = true;
        drawerPanel.setVisibility(View.VISIBLE);
        drawerMask.setVisibility(View.VISIBLE);
        Motion.drawerIn(drawerPanel, drawerMask, drawerPanel.getTranslationX()).start();
        if (!drawerSearching) renderDrawerHead();
        loadDrawerSessions();
        // 身份（昵称 + 头像）可能在上次打开后变了：先用本机缓存铺一遍，再按 /v1/me 静默刷一次。
        applyDrawerUser(Me.displayName(prefs), Me.avatar(this, prefs));
        Me.refresh(this, prefs, api, new Me.Listener() {
            @Override
            public void onMe(String id, String name, Bitmap avatar) {
                applyDrawerUser(name, avatar);
            }
        });
    }

    /** 瞬时落位（跳转前用）：不留「抽屉还在滑、下一页已经进场」的重叠帧。 */
    private void closeDrawerNow() {
        if (drawerPanel == null) return;
        drawerOpen = false;
        resetDrawerSearch();
        Motion.cancel(drawerPanel, drawerMask);
        drawerPanel.setTranslationX(-drawerWidth);
        drawerPanel.setVisibility(View.GONE);
        drawerMask.setAlpha(0f);
        drawerMask.setVisibility(View.GONE);
    }

    private void closeDrawer() {
        if (drawerPanel == null) return;
        drawerOpen = false;
        Motion.drawerOut(drawerPanel, drawerMask, -drawerWidth, new Runnable() {
            @Override
            public void run() {
                if (drawerOpen) return;
                drawerPanel.setVisibility(View.GONE);
                drawerMask.setVisibility(View.GONE);
                // 收完再清检索态：滑动过程中换头会闪一下。
                resetDrawerSearch();
            }
        }).start();
    }

    /** 拉一次会话列表：与首页同一个接口、同样不带参数，只用于抽屉展示。 */
    private void loadDrawerSessions() {
        drawerLoading = true;
        drawerError = "";
        if (drawerSessions.isEmpty()) renderDrawer();
        api.get("/v1/sessions", new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        drawerLoading = false;
                        drawerSessions.clear();
                        JSONArray array = body.optJSONArray("sessions");
                        if (array == null) array = new JSONArray();
                        for (int index = 0; index < array.length(); index++) {
                            JSONObject row = array.optJSONObject(index);
                            if (row != null) drawerSessions.add(row);
                        }
                        renderDrawer();
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        drawerLoading = false;
                        drawerError = message == null ? "" : message;
                        renderDrawer();
                    }
                });
            }
        });
    }

    private void renderDrawer() {
        if (drawerList == null) return;
        drawerList.removeAllViews();

        if (drawerError.length() > 0) {
            LinearLayout box = t.column();
            box.setPadding(t.dp(12), t.dp(24), t.dp(12), 0);
            box.addView(t.text(getString(R.string.mn_offline_title), 15f, t.text));
            TextView hint = t.text(drawerError, 12f, t.muted);
            LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            hintLp.topMargin = t.dp(8);
            hintLp.bottomMargin = t.dp(14);
            box.addView(hint, hintLp);
            TextView retry = t.text(getString(R.string.mn_retry), 14f, t.accent);
            retry.setBackground(t.ripple(10f));
            retry.setClickable(true);
            retry.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    loadDrawerSessions();
                }
            });
            box.addView(retry);
            drawerList.addView(box);
            return;
        }

        List<JSONObject> pool = drawerPool();
        if (pool.isEmpty()) {
            int emptyRes;
            if (drawerQuery.length() > 0) emptyRes = R.string.mn_search_no_hit;
            else if (drawerWs.length() > 0) emptyRes = R.string.mn_empty_workspace;
            else emptyRes = drawerLoading ? R.string.mn_refreshing : R.string.session_list_empty_title;
            LinearLayout box = t.column();
            box.setPadding(t.dp(12), t.dp(24), t.dp(12), 0);
            box.addView(t.text(getString(emptyRes), 14f, t.muted));
            drawerList.addView(box);
            return;
        }

        String group = "";
        for (int index = 0; index < pool.size(); index++) {
            JSONObject row = pool.get(index);
            String label = drawerGroupOf(row);
            if (!label.equals(group)) {
                group = label;
                LinearLayout head = t.row();
                // 与首页会话列表同规格：10dp 起排（整行 8dp 列表内衬 + 10dp），分组标题与行首状态槽同一条竖线。
                head.setPadding(t.dp(10), t.dp(18), t.dp(10), t.dp(4));
                head.addView(t.text(label, 13f, t.muted));
                drawerList.addView(head);
            }
            drawerList.addView(drawerRow(row));
        }
    }

    /* ------------------------------------------------------------------ */
    /* 抽屉顶栏（搜索胶囊 / 工作区 chips）与底栏（谁在用）                    */
    /* ------------------------------------------------------------------ */

    /**
     * 顶栏：常态是一枚搜索胶囊（点开变输入框）+ 工作区 chips；检索态整条换成输入行。
     *
     * 与首页 renderHead() 同一套几何：胶囊 38dp 高、左右 14dp、图标 16dp、文字 14sp；
     * chips 横向滚动、首尾 14dp 内衬。
     */
    private void renderDrawerHead() {
        if (drawerHeadBox == null) return;
        drawerHeadBox.removeAllViews();

        if (drawerSearching) {
            drawerHeadBox.addView(drawerSearchBar());
            return;
        }

        LinearLayout pill = t.row();
        pill.setBackground(t.round(t.surfaceAlt, 20f));
        pill.setPadding(t.dp(14), 0, t.dp(14), 0);
        pill.setClickable(true);
        pill.addView(t.icon(R.drawable.ic_search, t.muted, 16));
        TextView hint = t.text(getString(R.string.search_hint), 14f, t.muted);
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintLp.leftMargin = t.dp(7);
        pill.addView(hint, hintLp);
        pill.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openDrawerSearch();
            }
        });

        LinearLayout.LayoutParams pillLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(38));
        pillLp.leftMargin = t.dp(14);
        pillLp.rightMargin = t.dp(14);
        pillLp.topMargin = t.dp(14);
        pillLp.bottomMargin = t.dp(8);
        drawerHeadBox.addView(pill, pillLp);

        List<String> dirs = new ArrayList<String>();
        List<String> names = new ArrayList<String>();
        drawerWorkspaceDirs(dirs, names);
        if (!dirs.isEmpty()) drawerHeadBox.addView(drawerChips(dirs, names));
    }

    /** 检索态：‹ 退出 + 一个真输入框。输入即过滤（标题命中优先，其次最后一句），不外发检索。 */
    private View drawerSearchBar() {
        LinearLayout bar = t.row();
        bar.setPadding(t.dp(6), t.dp(12), t.dp(12), t.dp(2));

        FrameLayout back = t.iconButton(R.drawable.ic_back, t.text, 18, 40);
        back.setContentDescription(getString(R.string.ch_close));
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                closeDrawerSearch();
            }
        });
        bar.addView(back);

        LinearLayout pill = t.row();
        pill.setBackground(t.round(t.surfaceAlt, 20f));
        pill.setPadding(t.dp(14), 0, t.dp(10), 0);
        pill.addView(t.icon(R.drawable.ic_search, t.muted, 16));

        drawerSearchInput = new EditText(this);
        drawerSearchInput.setBackground(null);
        drawerSearchInput.setHint(getString(R.string.search_hint));
        drawerSearchInput.setHintTextColor(t.muted);
        drawerSearchInput.setTextColor(t.text);
        drawerSearchInput.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14f);
        drawerSearchInput.setSingleLine(true);
        drawerSearchInput.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        drawerSearchInput.setPadding(t.dp(8), 0, 0, 0);
        drawerSearchInput.setText(drawerQuery);
        drawerSearchInput.addTextChangedListener(new android.text.TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(android.text.Editable s) {
                drawerQuery = s == null ? "" : s.toString().trim();
                renderDrawer();
            }
        });
        pill.addView(drawerSearchInput, new LinearLayout.LayoutParams(
                0, t.dp(38), 1f));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, t.dp(38), 1f);
        lp.leftMargin = t.dp(6);
        bar.addView(pill, lp);
        return bar;
    }

    private void openDrawerSearch() {
        drawerSearching = true;
        drawerQuery = "";
        renderDrawerHead();
        focusDrawerSearch();
        renderDrawer();
    }

    private void closeDrawerSearch() {
        blurDrawerSearch();
        drawerSearching = false;
        drawerQuery = "";
        renderDrawerHead();
        renderDrawer();
    }

    /** 关闭抽屉时把检索态清干净：下次打开还是那枚胶囊，不留上回的关键字。 */
    private void resetDrawerSearch() {
        if (!drawerSearching && drawerQuery.length() == 0) return;
        blurDrawerSearch();
        drawerSearching = false;
        drawerQuery = "";
        renderDrawerHead();
    }

    private void focusDrawerSearch() {
        if (drawerSearchInput == null) return;
        drawerSearchInput.requestFocus();
        final EditText field = drawerSearchInput;
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                InputMethodManager keyboard =
                        (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.showSoftInput(field, 0);
            }
        }, 120);
    }

    private void blurDrawerSearch() {
        if (drawerSearchInput == null) return;
        InputMethodManager keyboard = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(drawerSearchInput.getWindowToken(), 0);
    }

    /** 工作区 chips：横向滚动，首尾 14dp 内衬（与首页 workspaceChips 同规格）。 */
    private View drawerChips(List<String> dirs, List<String> names) {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setClipToPadding(false);
        scroll.setPadding(t.dp(14), 0, t.dp(14), 0);

        LinearLayout row = t.row();
        scroll.addView(row);

        row.addView(drawerChip(getString(R.string.mn_ws_all), "", drawerWs.length() == 0));
        for (int index = 0; index < dirs.size(); index++) {
            String dir = dirs.get(index);
            String name = index < names.size() ? names.get(index) : "";
            if (name.length() == 0 || name.equalsIgnoreCase(dir)) name = drawerShortName(dir);
            row.addView(drawerChip(name, dir, dir.equals(drawerWs)));
        }
        return scroll;
    }

    private View drawerChip(String label, final String dir, boolean on) {
        TextView chip = t.text(label, 13f, on ? t.accent : t.text);
        chip.setSingleLine(true);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(t.dp(12), 0, t.dp(12), 0);
        chip.setBackground(on ? t.pill(t.accentSoft) : t.roundStroke(t.surface, t.line, 15f));
        chip.setClickable(true);
        chip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (dir.equals(drawerWs)) return;
                drawerWs = dir;
                renderDrawerHead();
                renderDrawer();
            }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30));
        lp.rightMargin = t.dp(8);
        chip.setLayoutParams(lp);
        return chip;
    }

    /**
     * chips 的目录集合：电脑端登记的工作区 + 会话里出现过但没登记的 cwd（与首页同一口径），
     * 否则直接开在子目录的会话在工作区视角下会凭空消失。
     */
    private void drawerWorkspaceDirs(List<String> dirs, List<String> names) {
        for (int index = 0; index < drawerWsCwds.size(); index++) {
            dirs.add(drawerWsCwds.get(index));
            names.add(index < drawerWsNames.size() ? drawerWsNames.get(index) : "");
        }
        for (int index = 0; index < drawerSessions.size(); index++) {
            String dir = drawerSessions.get(index).optString("cwd", "");
            if (dir.length() == 0) continue;
            boolean known = false;
            for (int probe = 0; probe < dirs.size(); probe++) {
                if (dirs.get(probe).equalsIgnoreCase(dir)) {
                    known = true;
                    break;
                }
            }
            if (!known) {
                dirs.add(dir);
                names.add("");
            }
        }
    }

    /** 当前抽屉真正要显示的会话：先按工作区、再按关键字过滤（与首页 visibleSessions + renderSearch 同口径）。 */
    private List<JSONObject> drawerPool() {
        String needle = drawerQuery == null ? "" : drawerQuery.toLowerCase(Locale.US);
        List<JSONObject> out = new ArrayList<JSONObject>();
        for (int index = 0; index < drawerSessions.size(); index++) {
            JSONObject row = drawerSessions.get(index);
            if (drawerWs.length() > 0 && !drawerWs.equalsIgnoreCase(row.optString("cwd", ""))) continue;
            if (needle.length() > 0) {
                String title = row.optString("title", "").toLowerCase(Locale.US);
                String last = row.optString("lastText", "").toLowerCase(Locale.US);
                if (!title.contains(needle) && !last.contains(needle)) continue;
            }
            out.add(row);
        }
        return out;
    }

    /** 这个目录还在不在当前 chips 里（电脑端删掉工作区后，筛选要退回「全部」）。 */
    private boolean containsDir(String dir) {
        List<String> dirs = new ArrayList<String>();
        List<String> names = new ArrayList<String>();
        drawerWorkspaceDirs(dirs, names);
        for (int index = 0; index < dirs.size(); index++) {
            if (dirs.get(index).equalsIgnoreCase(dir)) return true;
        }
        return false;
    }

    /** 目录最后一段当工作区名（与首页 shortName 逐字一致）。 */
    private String drawerShortName(String dir) {
        String value = dir == null ? "" : dir.trim();
        while (value.length() > 1 && (value.endsWith("\\") || value.endsWith("/"))) {
            value = value.substring(0, value.length() - 1);
        }
        int cut = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
        if (cut >= 0 && cut + 1 < value.length()) return value.substring(cut + 1);
        return value;
    }

    /** 底栏：34dp 圆头像 · 昵称 · 「主机 · 设备」· ⋯（点整行进设置，与首页同一行分工）。 */
    private LinearLayout drawerUserRow() {
        LinearLayout row = t.row();
        row.setPadding(t.dp(16), t.dp(10), t.dp(8), t.dp(18));
        row.setBackground(t.ripple(14f));
        row.setClickable(true);

        drawerUserAvatar = new FrameLayout(this);
        drawerUserAvatar.setBackground(t.circle(t.accentSoft));
        drawerUserLetter = t.text("", 15f, t.accent);
        drawerUserLetter.setGravity(Gravity.CENTER);
        drawerUserLetter.setTypeface(null, Typeface.BOLD);
        drawerUserAvatar.addView(drawerUserLetter, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        drawerUserPhoto = new ImageView(this);
        drawerUserPhoto.setScaleType(ImageView.ScaleType.FIT_XY);
        drawerUserPhoto.setVisibility(View.GONE);
        drawerUserAvatar.addView(drawerUserPhoto, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        row.addView(drawerUserAvatar, new LinearLayout.LayoutParams(t.dp(34), t.dp(34)));

        LinearLayout texts = t.column();
        drawerUserName = t.text(Me.displayName(prefs), 16f, t.text);
        drawerUserName.setSingleLine(true);
        drawerUserName.setEllipsize(TextUtils.TruncateAt.END);
        TextView device = t.text(drawerHostLine(), 11f, t.muted);
        device.setSingleLine(true);
        device.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        texts.addView(drawerUserName);
        texts.addView(device);
        LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        textLp.leftMargin = t.dp(10);
        row.addView(texts, textLp);

        FrameLayout more = t.iconButton(R.drawable.ic_more, t.muted, 18, 40);
        more.setContentDescription(getString(R.string.mn_menu_settings));
        more.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                drawerMenu();
            }
        });
        row.addView(more);

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openFromDrawer(new Intent(ChatActivity.this, SettingsActivity.class));
            }
        });
        return row;
    }

    /** 身份刷新：有电脑端头像就贴圆图，没有就用首字母兜底（与首页 applyUser 同一套）。 */
    private void applyDrawerUser(String name, Bitmap avatar) {
        if (drawerUserName != null) {
            String shown = name == null ? "" : name.trim();
            drawerUserName.setText(shown.length() > 0 ? shown : Me.displayName(prefs));
        }
        if (drawerUserAvatar == null || drawerUserLetter == null || drawerUserPhoto == null) return;
        Bitmap source = avatar != null ? avatar : Me.avatar(this, prefs);
        Bitmap round = source == null ? null : Me.circle(source, t.dp(34));
        if (round != null) {
            drawerUserPhoto.setImageBitmap(round);
            drawerUserPhoto.setVisibility(View.VISIBLE);
            drawerUserLetter.setVisibility(View.GONE);
            return;
        }
        drawerUserPhoto.setVisibility(View.GONE);
        drawerUserLetter.setVisibility(View.VISIBLE);
        String shown = drawerUserName == null ? Me.displayName(prefs)
                : String.valueOf(drawerUserName.getText());
        drawerUserLetter.setText(drawerInitial(shown));
    }

    private String drawerInitial(String value) {
        String text = value == null ? "" : value.trim();
        if (text.length() == 0) return "?";
        return text.substring(0, 1).toUpperCase(Locale.ROOT);
    }

    /** 副标题：当前主机名 · 设备名（没配对时退回标语），与首页 hostLine 同一条口径。 */
    private String drawerHostLine() {
        Hosts.Entry active = Hosts.active(prefs);
        String host = active == null ? "" : Hosts.title(active);
        String name = host.length() > 0 ? host : Prefs.normalize(prefs.address());
        if (name.length() == 0) return App.slogan(this);
        String device = prefs.device();
        return device.length() > 0 ? name + " · " + device : name;
    }

    /** ⋯ 菜单：与首页抽屉同一套卡片菜单（在线主机 / 归档箱 / 刷新 / 连接设置 / 设置）。 */
    private void drawerMenu() {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(0, t.dp(6), 0, t.dp(8));

        TextView head = t.strong(drawerHostLine(), 13f, t.muted);
        head.setGravity(Gravity.CENTER);
        head.setSingleLine(true);
        head.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        head.setPadding(t.dp(18), t.dp(14), t.dp(18), t.dp(10));
        card.addView(head);
        card.addView(t.hairline());

        String[] labels = new String[]{
                getString(R.string.mn_menu_hosts), getString(R.string.mn_menu_archive),
                getString(R.string.mn_menu_refresh), getString(R.string.mn_menu_connect),
                getString(R.string.mn_menu_settings)};
        for (int index = 0; index < labels.length; index++) {
            final int which = index;
            TextView item = t.text(labels[index], 15f, t.text);
            item.setGravity(Gravity.CENTER);
            item.setPadding(t.dp(16), t.dp(13), t.dp(16), t.dp(13));
            item.setBackground(t.ripple(8f));
            item.setClickable(true);
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    dialog.dismiss();
                    if (which == 0) {
                        openFromDrawer(new Intent(ChatActivity.this, HostsActivity.class));
                    } else if (which == 1) {
                        openFromDrawer(new Intent(ChatActivity.this, MainActivity.class)
                                .putExtra("archive", true));
                    } else if (which == 2) {
                        loadDrawerSessions();
                    } else if (which == 3) {
                        openFromDrawer(new Intent(ChatActivity.this, PairActivity.class));
                    } else {
                        openFromDrawer(new Intent(ChatActivity.this, SettingsActivity.class));
                    }
                }
            });
            card.addView(item);
        }

        dialog.setContentView(card);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams();
            lp.copyFrom(window.getAttributes());
            lp.width = t.dp(280);
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            window.setAttributes(lp);
        }
        dialog.show();
    }

    /** 抽屉里跳页：先让抽屉无动画落位，再起页面并接管右进转场（与首页 pushIn 同一套）。 */
    private void openFromDrawer(Intent intent) {
        closeDrawerNow();
        Nav.open(this, intent);
    }

    private String drawerGroupOf(JSONObject row) {
        if (row.optBoolean("pinned", false)) return getString(R.string.mn_group_pinned);
        Calendar now = Calendar.getInstance();
        Calendar then = Calendar.getInstance();
        long ms = row.optLong("updatedAt", 0L);
        if (ms > 0) then.setTimeInMillis(ms);
        else then = now;
        SimpleDateFormat day = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        String today = day.format(now.getTime());
        String target = day.format(then.getTime());
        if (today.equals(target)) return getString(R.string.session_history_timeline_label_today);
        now.add(Calendar.DAY_OF_YEAR, -1);
        if (day.format(now.getTime()).equals(target)) {
            return getString(R.string.session_history_timeline_label_yesterday);
        }
        now.add(Calendar.DAY_OF_YEAR, -6);
        if (then.compareTo(now) >= 0) return getString(R.string.session_history_timeline_label7_days);
        now.add(Calendar.DAY_OF_YEAR, -23);
        if (then.compareTo(now) >= 0) return getString(R.string.session_history_timeline_label30days);
        return getString(R.string.session_history_timeline_label_earlier);
    }

    /**
     * 抽屉里的一行：行首状态槽 + 标题；当前会话用主色 + accentSoft 底标出来（官方同款）。
     *
     * 行首 20dp 槽与首页会话列表（MainActivity.drawerRow）逐字一致 —— 两处同一个会话列表，
     * 只要一边有槽一边没有，同一批会话在两页里的文字左缘就会差一格（20dp + 8dp）；
     * 没有标记的行也必须用空 View 占住槽位，否则「绿点消失」时整列文字会向左吸到 12dp。
     */
    private View drawerRow(final JSONObject row) {
        final String id = row.optString("id", "");
        String name = row.optString("title", "");
        if (name.length() == 0) name = getString(R.string.session_untitled);
        final boolean current = id.length() > 0 && id.equals(sessionId);

        // 与首页同源：status ∈ {running, idle, failed}（见 plugin/lib/projection.js），itemCount 判「跑过没有」。
        final String status = row.optString("status", "idle");
        final boolean running = "running".equals(status);
        final boolean failed = "failed".equals(status);
        // 绿点 = 已完成且未读（与首页同一个记账，见 Read.java）；点了这行 → switchTo 里记账成已读。
        final boolean unread = Read.unread(this, row);

        LinearLayout cell = t.row();
        cell.setPadding(t.dp(10), 0, t.dp(10), 0);
        cell.setMinimumHeight(t.dp(44));
        cell.setGravity(Gravity.CENTER_VERTICAL);
        cell.setBackground(current ? t.round(t.accentSoft, 14f) : t.ripple(14f));
        cell.setClickable(true);

        LinearLayout.LayoutParams slotLp = new LinearLayout.LayoutParams(t.dp(20), t.dp(20), 0f);
        slotLp.rightMargin = t.dp(8);
        slotLp.gravity = Gravity.CENTER_VERTICAL;
        if (running) {
            cell.addView(new StateRing(this, t), slotLp);
        } else if (failed) {
            cell.addView(new StateDot(this, t, t.bad), slotLp);
        } else if (unread) {
            cell.addView(new StateDot(this, t, t.ok), slotLp);
        } else {
            // 未跑过的会话：空位也占住，标记（圆环 / 绿点）消失时文字不左移。
            cell.addView(new View(this), slotLp);
        }

        TextView label = t.text(name, 16f, current ? t.accent : t.text);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        cell.addView(label, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        cell.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                // 进了这个会话就算读过：绿点在这里落账，再回抽屉就是已读态。
                Read.markRead(ChatActivity.this, row);
                switchTo(row);
            }
        });
        return cell;
    }

    /** 原地切换会话：抽屉收起、同参数重新开本页，不加页面转场（官方也是就地换内容）。 */
    private void switchTo(JSONObject row) {
        final String id = row.optString("id", "");
        if (id.length() == 0) return;
        if (id.equals(sessionId)) {
            closeDrawer();
            return;
        }
        Intent intent = new Intent(this, ChatActivity.class);
        intent.putExtra("sessionId", id);
        intent.putExtra("title", row.optString("title", ""));
        closeDrawerNow();
        switchAnimNone();
        startActivity(intent);
        finish();
    }

    private void switchAnimNone() {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            overrideActivityTransition(Activity.OVERRIDE_TRANSITION_OPEN, 0, 0);
            overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE, 0, 0);
        } else {
            overridePendingTransition(0, 0);
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    /** 退回首页：与进入时的右进方向对称，避免系统默认的缩放入场把抽屉/列表帧混在一起。 */
    private void closeWithPop() {
        Nav.close(this);
    }
}
