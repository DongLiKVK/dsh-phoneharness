package com.lc.phoneharness;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * 首页 = 官方「新对话页」，左抽屉 = 官方「历史列表」。
 *
 * 官方 DeepSeek App 的首页不是列表，而是一张空白的提问页：左上角抽屉、右上角语音与新建、
 * 正中一枚鲸鱼 + 一句「嗨！今天想聊些什么？」，底部是输入卡片。历史会话全在抽屉里，
 * 抽屉顶部是搜索胶囊，组头带「多选」，底部是账号行 —— 本页按这套结构重排：
 *
 *   首页   顶栏（≡ / 语音 / ⊕） + 居中问候 + 输入卡片（深度思考·智能搜索·上传·发送）
 *   抽屉   搜索胶囊 → 全屏搜索；分组标题（今天/昨天/7 天内/30 天内/更早）+ 多选；
 *          条目只有标题；底部头像行进设置
 *   多选   「选择对话」+ ✕；行首选择圈；底部「置顶 | 删除」
 *
 * 发送逻辑：首页直接 POST /v1/sessions（带图），成功后进 ChatActivity。
 * 工作目录与模型前缀在这一层从 /v1/catalog 取一次并缓存，避免每次发消息都问一遍。
 */
public class MainActivity extends Activity {

    private static final int REQ_SHOT = 4021;
    private static final int REQ_PICK = 4022;
    private static final int REQ_FILE = 4023;
    private static final int REQ_ASR = 4024;

    private Prefs prefs;
    private Api api;
    private Theme t;
    /** 建界面时的明暗状态，用于 onResume 检测设置页改了外观后自我重建。 */
    private boolean darkAtBuild;
    /** attach 阶段定下的语言：onResume 用它判断界面是否需要重建（与主题的 darkAtBuild 同一套做法）。 */
    private String langAtBuild;

    private Root root;
    private LinearLayout content;
    private LinearLayout drawer;
    private View mask;
    private boolean drawerOpen;
    private int drawerWidth;

    /* ---------------- 首页输入区 ---------------- */
    private EditText input;
    private FrameLayout actionRing;
    private FrameLayout uploadRing;
    private FrameLayout actionButton;
    private ImageView actionIcon;
    private LinearLayout uploadPanel;
    private ImageView uploadIcon;
    private LinearLayout attachStrip;
    private LinearLayout modelChip;
    private LinearLayout permChip;
    private ImageView modelIcon;
    private ImageView permIcon;
    private ImageView modelArrow;
    private ImageView permArrow;
    private TextView modelLabel;
    private TextView permLabel;
    /* 契约 §3.1 v1.3.1：工作区 / 预设两枚 chip，与模型 / 权限同排在一条横向滚动带上。 */
    private LinearLayout wsChip;
    private LinearLayout presetChip;
    private LinearLayout chipsRow;
    private ImageView wsIcon;
    private ImageView presetIcon;
    private ImageView wsArrow;
    private ImageView presetArrow;
    private TextView wsLabel;
    private TextView presetLabel;
    private TextView archiveTitle;
    private final List<Pick.Pending> pending = new ArrayList<Pick.Pending>();
    private boolean sending;
    private long lastSendAt;

    /* ---------------- 抽屉 ---------------- */
    private LinearLayout headBox;
    private LinearLayout list;
    private ScrollView listScroll;
    private LinearLayout batchBar;
    private TextView batchCount;
    private View userBox;

    /* ---------------- 搜索页 ---------------- */
    private View searchPage;
    private EditText searchInput;
    private LinearLayout searchList;

    /* ---------------- 数据 ---------------- */
    private final List<JSONObject> sessions = new ArrayList<JSONObject>();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean archivedView;
    private boolean batchMode;
    private final List<String> selected = new ArrayList<String>();
    private int batchDone;
    private int batchTotal;
    private boolean batchOk = true;
    private String batchError = "";

    /* ---------------- 目录缓存 ---------------- */
    private String cwd = "";
    private boolean catalogTried;

    /* ---------------- 工作区（对齐电脑端 harness） ---------------- */
    private final List<String> wsCwds = new ArrayList<String>();
    private final List<String> wsNames = new ArrayList<String>();
    /** 空字符串 = 全部工作区（不按目录过滤）。 */
    private String wsSelected = "";
    /** 进归档箱前挂起的工作区选择，退出归档箱时原样恢复（防止归档期间串味）。 */
    private String wsBeforeArchive = "";
    /**
     * 上一次真正重建列表时的内容指纹。
     *
     * 每次 onResume 都会 load(false) 拉一遍会话；只要数据没变就跳过重建，
     * 否则「点进设置再返回」会把抽屉里几十行 View 全部 remove 再 add 一次 ——
     * 主线程被占住几十毫秒，看起来就是返回时闪一下、滑动也跟着顿。
     */
    private String renderedSig;

    // 抽屉底部账号栏：头像 / 昵称 / 首字母兜底，见 Me。
    private FrameLayout userAvatar;
    private TextView userNameView;
    private TextView userLetter;
    private ImageView userPhoto;

    private File shotFile;

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Langs.wrap(base));
        langAtBuild = Langs.current(base);
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = new Prefs(this);
        api = new Api(prefs);
        // 上次在手机端选的工作区，跟电脑端对齐后由 /v1/catalog 再校验一遍。
        wsSelected = prefs.workspaceCwd();
        t = Theme.of(this);
        darkAtBuild = t.dark;
        getWindow().setStatusBarColor(t.bg);
        getWindow().setNavigationBarColor(t.bg);
        getWindow().getDecorView().setSystemUiVisibility(
                t.dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        archivedView = getIntent().getBooleanExtra("archive", false);
        if (archivedView) {
            // 归档箱是独立视图：进来先把工作区选择挂起（退出时恢复）。
            wsBeforeArchive = wsSelected;
            wsSelected = "";
        }
        drawerWidth = (int) (getResources().getDisplayMetrics().widthPixels * 0.82f);
        build();
        ensureCatalog(null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 语言在 attach 阶段定死：设置页改过语言后，回到首页要整体重建。
        if (Langs.changed(this, langAtBuild)) {
            recreate();
            return;
        }
        // 设置页可能刚改过「外观」：主题是建界面时算出来的，明暗一变就整体重建。
        if (prefs != null && Theme.of(this).dark != darkAtBuild) {
            recreate();
            return;
        }
        if (prefs.token().length() == 0) {
            pushIn(new Intent(this, PairActivity.class));
            return;
        }
        // 每次回到首页都把底部三格工具栏收起来：进应用 / 从会话页返回都固定成未展开态。
        closePanel();
        load(false);
        syncRunningPoll();
        // 顺带刷一次「电脑端登录的账号」：头像与昵称在抽屉底部，失败静默保留上次的。
        Me.refresh(this, prefs, api, new Me.Listener() {
            @Override
            public void onMe(String id, String name, Bitmap avatar) {
                applyUser(name, avatar);
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 退到后台就别再为空转的环每 5 秒问一次列表了。
        ui.removeCallbacks(runningPoll);
    }

    /* ------------------------------------------------------------------ */
    /* 骨架                                                               */
    /* ------------------------------------------------------------------ */

    private void build() {
        root = new Root(this);
        root.setBackgroundColor(t.bg);

        content = t.column();
        content.setBackgroundColor(t.bg);

        if (archivedView) {
            // 归档箱是独立页面：顶栏 ‹ + 居中标题，主区直接铺归档会话列表。
            // 之前复用首页骨架（hero + 输入卡，会话列表塞在抽屉里），从设置进来只看得
            // 到欢迎页、归档列表被抽屉挡着，看起来就像「根本进不去归档箱」。
            content.addView(archiveHeader());
            FrameLayout body = new FrameLayout(this);
            content.addView(body, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
            makeList();
            body.addView(listScroll, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            root.addView(content, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            setContentView(root);
            return;
        }

        content.addView(header());

        FrameLayout mid = new FrameLayout(this);
        content.addView(mid, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        mid.addView(hero(), new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        content.addView(composer());

        root.addView(content, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        mask = new View(this);
        mask.setBackgroundColor(0x99000000);
        mask.setAlpha(0f);
        mask.setVisibility(View.GONE);
        mask.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                closeDrawer();
            }
        });
        root.addView(mask, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        drawer = drawerBody();
        FrameLayout.LayoutParams drawerLp = new FrameLayout.LayoutParams(
                drawerWidth, FrameLayout.LayoutParams.MATCH_PARENT);
        root.addView(drawer, drawerLp);
        drawer.setTranslationX(-drawerWidth);
        drawer.setVisibility(View.GONE);

        searchPage = searchBody();
        searchPage.setVisibility(View.GONE);
        root.addView(searchPage, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        root.setSwipe(new Root.Swipe() {
            @Override
            public void drag(float dx) {
                if (drawerOpen || searchPage.getVisibility() == View.VISIBLE) return;
                float x = Math.min(0f, -drawerWidth + dx);
                if (x < -drawerWidth) x = -drawerWidth;
                drawer.setTranslationX(x);
                drawer.setVisibility(View.VISIBLE);
                mask.setVisibility(View.VISIBLE);
                mask.setAlpha(Math.min(1f, dx / drawerWidth) * 0.6f);
            }

            @Override
            public void release(float dx) {
                if (drawerOpen || searchPage.getVisibility() == View.VISIBLE) return;
                if (dx > drawerWidth * 0.34f) openDrawer();
                else closeDrawer();
            }
        });

        setContentView(root);
        renderChips();
        renderAction();
        // 契约 §3.1：首帧先用缓存渲染（不阻塞），再静默拉一次主机状态。
        Harness.refresh(this, prefs, new Runnable() {
            @Override
            public void run() {
                renderChips();
            }
        });
    }

    /** 顶栏：≡ … 语音 · ⊕（官方首页没有标题文字）。 */
    private View header() {
        LinearLayout bar = t.row();
        bar.setPadding(t.dp(6), t.dp(6), t.dp(6), t.dp(2));
        bar.setBackgroundColor(t.bg);

        FrameLayout menu = t.iconButton(R.drawable.ic_menu, t.text, 22, 44);
        menu.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (drawerOpen) closeDrawer();
                else openDrawer();
            }
        });
        bar.addView(menu);

        // 模板顶栏正中是空的：不留品牌位，左右各靠边。
        bar.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));

        FrameLayout voice = t.iconButton(R.drawable.ic_volume, t.text, 21, 44);
        voice.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                listenSpeech();
            }
        });
        bar.addView(voice);

        FrameLayout create = t.iconButton(R.drawable.ic_new_chat, t.text, 24, 44);
        create.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                input.setText("");
                pending.clear();
                renderStrip();
                input.requestFocus();
            }
        });
        bar.addView(create);
        return bar;
    }

    /** 正中：品牌徽章 + 「嗨！今天想聊些什么？」。 */
    private View hero() {
        LinearLayout box = t.column();
        box.setGravity(Gravity.CENTER);
        // 尺寸走 Theme.heroScale()：以 360x640dp 为 1.0，屏幕越大整块按比例放大（上限 1.6）。
        // 基准值已按参考实测对齐（logo 墨迹高 32dp、问候语墨迹高 20dp）。
        float hs = t.heroScale();
        ImageView logo = new ImageView(this);
        logo.setImageResource(t.brandLogo());
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int logoBox = Math.round(t.dp(Theme.HERO_LOGO_DP) * hs);
        box.addView(logo, new LinearLayout.LayoutParams(logoBox, logoBox));
        TextView hello = t.strong(getString(R.string.home_greeting), Theme.HERO_GREET_SP * hs, t.text);
        hello.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(t.dp(Theme.HERO_GAP_DP) * hs);
        box.addView(hello, lp);
        // 居中到整屏：mid 只占「顶栏下 / 输入卡上」这一段，它的几何中心比屏幕中心偏高，
        // 所以布局完就量一次真实位置，把视觉中心补到屏幕中线上。
        // 只改 translationY（不触发重新布局），且每次都按「当前位置」反推差值，多次回调也只会收敛到中线。
        box.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int left, int top, int right, int bottom,
                                       int oldLeft, int oldTop, int oldRight, int oldBottom) {
                View decor = getWindow().getDecorView();
                int[] heroPos = new int[2];
                int[] decorPos = new int[2];
                v.getLocationOnScreen(heroPos);
                decor.getLocationOnScreen(decorPos);
                float centerNow = heroPos[1] + v.getHeight() / 2f;
                // 目标：整屏中线再上提一个光学偏置——布局框居中了墨迹会偏低，
                // 这个偏置就是“墨迹中心 - 布局框中心”的实测值，随 hs 缩放。
                float centerWant = decorPos[1] + decor.getHeight() / 2f
                        - Math.round(t.dp(Theme.HERO_INK_BIAS_DP) * hs);
                v.setTranslationY(v.getTranslationY() + (centerWant - centerNow));
            }
        });
        return box;
    }

    /* ------------------------------------------------------------------ */
    /* 首页输入卡片                                                       */
    /* ------------------------------------------------------------------ */

    /**
     * 输入卡片右侧的圆钮。官方这两枚的「圈」是矢量图标自带的（ic_add_outline_26 /
     * ic_voice_26 都含 22.6r 的圆），按钮只提供 44dp 触摸区，不再额外描边——
     * 否则就成了双层圈的「同心圆」效果，跟官方移动端不一致。
     */
    private static final class Ring {
        FrameLayout touch;
        FrameLayout ring;
        ImageView icon;
    }

    private Ring ringButton(int iconRes, View.OnClickListener click) {
        Ring r = new Ring();
        r.touch = new FrameLayout(this);
        r.touch.setBackground(t.ripple(22f));
        r.touch.setClickable(true);
        r.ring = new FrameLayout(this);
        r.ring.setBackground(null);
        r.icon = t.icon(iconRes, t.text, 26);
        r.ring.addView(r.icon, new FrameLayout.LayoutParams(t.dp(26), t.dp(26), Gravity.CENTER));
        r.touch.addView(r.ring, new FrameLayout.LayoutParams(t.dp(32), t.dp(32), Gravity.CENTER));
        r.touch.setOnClickListener(click);
        return r;
    }

    private View composer() {
        LinearLayout wrap = t.column();
        wrap.setBackgroundColor(t.bg);
        wrap.setPadding(t.dp(11), t.dp(4), t.dp(11), t.dp(40));

        attachStrip = t.row();
        attachStrip.setVisibility(View.GONE);
        LinearLayout.LayoutParams stripLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        stripLp.bottomMargin = t.dp(8);
        wrap.addView(attachStrip, stripLp);

        LinearLayout card = t.column();
        card.setBackground(t.roundStroke(t.cardFill, t.cardStroke, 28f));
        card.setPadding(t.dp(14), t.dp(12), t.dp(8), t.dp(10));

        input = new EditText(this);
        input.setTextColor(t.text);
        input.setHintTextColor(t.muted2);
        input.setHint(getString(R.string.composer_hint_voice));
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f * t.fontScale);
        input.setBackground(null);
        input.setIncludeFontPadding(false);
        input.setPadding(0, t.dp(2), 0, t.dp(2));
        input.setMinHeight(t.dp(24));
        input.setMaxLines(5);
        input.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_ENTER_ACTION);
        input.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                renderAction();
            }
        });
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
        card.addView(input, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout row = t.row();
        LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rowLp.topMargin = t.dp(7);
        card.addView(row, rowLp);

        // 契约 §3.1 v1.3.4：工作区 / 预设两枚 chip 独立成一行，位于输入卡片正上方、整行靠左
        // （用户反馈：「位置不要放在打字框里面，放在打字框上面一行靠左」）；模型 / 权限两枚
        // chip 回到输入胶囊里的那一行（用户反馈：恢复原位置，交互与改动前一致）。
        // 两枚 chip 仍排进一条横向滚动带：宽屏全显示、窄屏横向滚动，一律不换行。
        HorizontalScrollView chipScroll = new HorizontalScrollView(this);
        chipScroll.setHorizontalScrollBarEnabled(false);
        chipScroll.setFillViewport(false);
        chipScroll.setClipToPadding(false);
        chipScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        chipScroll.setPadding(t.dp(4), 0, t.dp(4), 0);
        chipsRow = t.row();
        chipScroll.addView(chipsRow, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        wsChip = seatChip(Harness.workspaceIcon(), 34, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showWorkspacePanel(MainActivity.this, t, prefs, wsChip, new Runnable() {
                    @Override
                    public void run() {
                        renderChips();
                    }
                });
            }
        });
        wsIcon = (ImageView) wsChip.getChildAt(0);
        wsLabel = (TextView) wsChip.getChildAt(1);
        wsArrow = (ImageView) wsChip.getChildAt(2);
        chipsRow.addView(wsChip);

        presetChip = seatChip(Harness.presetIcon(), 52, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showPresetPanel(MainActivity.this, t, prefs, presetChip, new Runnable() {
                    @Override
                    public void run() {
                        renderChips();
                    }
                });
            }
        });
        presetIcon = (ImageView) presetChip.getChildAt(0);
        presetLabel = (TextView) presetChip.getChildAt(1);
        presetArrow = (ImageView) presetChip.getChildAt(2);
        chipsRow.addView(presetChip, seatLp(t));

        
        modelChip = seatChip(R.drawable.ic_data, 70, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showModelMenu(MainActivity.this, t, prefs, modelChip, new Runnable() {
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
                Seats.showPermissionMenu(MainActivity.this, t, prefs, permChip, new Runnable() {
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

        // 弹簧：把 chip 与两枚 44dp 圆钮分开，圆钮始终贴卡片右侧。
        row.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));

        // 默认收纳：⊕ 就是「加上传」的样子，三格工具栏只在点它之后才展开（见 togglePanel）。
        Ring upload = ringButton(R.drawable.ic_upload_add, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                togglePanel();
            }
        });
        uploadRing = upload.ring;
        uploadIcon = upload.icon;
        LinearLayout.LayoutParams uploadLp = new LinearLayout.LayoutParams(t.dp(44), t.dp(44));
        uploadLp.leftMargin = t.dp(2);
        row.addView(upload.touch, uploadLp);

        Ring action = ringButton(R.drawable.ic_voice26, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (input.getText().toString().trim().length() > 0) send();
                else listenSpeech();
            }
        });
        actionButton = action.touch;
        actionRing = action.ring;
        actionIcon = action.icon;
        LinearLayout.LayoutParams actionLp = new LinearLayout.LayoutParams(t.dp(44), t.dp(44));
        actionLp.leftMargin = t.dp(2);
        row.addView(actionButton, actionLp);

        // 座位行：卡片左内边距 11dp + 本行 4dp + chip 自身 7dp ≈ 卡片内文字左沿（11 + 11），
        // 因此两枚 chip 与输入框文字左对齐；wrap 子 view 顺序 = attachStrip → 座位行 → 输入卡片。
        LinearLayout.LayoutParams chipLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        chipLp.bottomMargin = t.dp(6);
        wrap.addView(chipScroll, chipLp);

        wrap.addView(card);

        uploadPanel = t.row();
        uploadPanel.setVisibility(View.GONE);
        uploadPanel.setPadding(t.dp(11), t.dp(9), t.dp(11), 0);
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
                }), tileLp(t.dp(13)));
        uploadPanel.addView(tile(R.drawable.ic_tile_file, R.string.composer_upload_file,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        togglePanel();
                        chooseFile();
                    }
                }), tileLp(t.dp(13)));
        wrap.addView(uploadPanel);

        return wrap;
    }

    /** composer 上的座位 chip：图标 + 文案 + chevronDown（对齐桌面版触发器）。 */
    private LinearLayout seatChip(int iconRes, int maxTextDp, View.OnClickListener click) {
        LinearLayout box = t.row();
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30)));
        // 契约 §3.1 v1.3.2 收窄：每枚省 3dp，让 360dp 屏上四枚 chip 全部完整可见。
        box.setPadding(t.dp(7), 0, t.dp(5), 0);
        box.setBackground(t.roundStroke(t.cardFill, t.line, 15f));
        box.setClickable(true);
        box.setOnClickListener(click);

        box.addView(t.icon(iconRes, t.chipInk, 12));

        TextView text = t.text("", 12f, t.chipInk);
        text.setSingleLine(true);
        text.setEllipsize(TextUtils.TruncateAt.END);
        text.setMaxWidth(t.dp(maxTextDp));
        LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        textLp.leftMargin = t.dp(3);
        box.addView(text, textLp);

        ImageView arrow = t.icon(R.drawable.ic_chevron_down, t.chipInk2, 9);
        LinearLayout.LayoutParams arrowLp = new LinearLayout.LayoutParams(t.dp(9), t.dp(9));
        arrowLp.leftMargin = t.dp(1);
        box.addView(arrow, arrowLp);
        return box;
    }

    /**
     * 四枚座位 chip 的文案/图标都从这里出（工作区 → 预设 → 模型 → 权限）。
     * 工作区 / 预设取「主机实时状态 → 本地快照 → 占位文案」（契约 §3.1：主机没数据也要能点能看）。
     */
    private void renderChips() {
        if (wsLabel != null) wsLabel.setText(harnessWorkspaceLabel());
        if (presetLabel != null) presetLabel.setText(harnessPresetLabel());
        if (wsIcon != null) {
            wsIcon.setImageResource(Harness.workspaceIcon());
            wsIcon.setColorFilter(t.chipInk);
        }
        if (presetIcon != null) {
            presetIcon.setImageResource(Harness.presetIcon());
            presetIcon.setColorFilter(t.chipInk);
        }
        if (modelLabel != null) modelLabel.setText(Seats.compactTitle(this, prefs));
        if (permLabel != null) {
            String permission = Seats.permission(prefs);
            permLabel.setText(Seats.permLabel(this, permission));
            if (permIcon != null) permIcon.setImageResource(Seats.permIcon(permission));
        }
        if (modelIcon != null) modelIcon.setColorFilter(t.chipInk);
        if (permIcon != null) permIcon.setColorFilter(t.chipInk);
        if (wsArrow != null) wsArrow.setColorFilter(t.chipInk2);
        if (presetArrow != null) presetArrow.setColorFilter(t.chipInk2);
        if (modelArrow != null) modelArrow.setColorFilter(t.chipInk2);
        if (permArrow != null) permArrow.setColorFilter(t.chipInk2);
    }

    /** 工作区 chip 文案：主机 → 快照 → 占位。 */
    private String harnessWorkspaceLabel() {
        Harness.State state = Harness.state();
        if (state != null) {
            String title = state.workspaceTitle();
            if (title.length() > 0) return title;
        }
        String cached = prefs.harnessWorkspaceTitle();
        if (cached != null && cached.length() > 0) return cached;
        return getString(R.string.harness_workspace_chip_default);
    }

    /** 预设 chip 文案：主机 → 快照 → 占位。 */
    private String harnessPresetLabel() {
        Harness.State state = Harness.state();
        if (state != null) {
            String title = state.presetTitle(state.agentPreset);
            if (title.length() > 0) return title;
        }
        String cached = prefs.harnessPresetTitle();
        if (cached != null && cached.length() > 0) return cached;
        return getString(R.string.harness_preset_chip_default);
    }

    /** 座位 chip 左间距：同排相邻一枚留 6dp（滚动带内第一枚不加）。 */
    private static LinearLayout.LayoutParams seatLp(Theme theme) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, theme.dp(30));
        lp.leftMargin = theme.dp(6);
        return lp;
    }

    private View tile(int iconRes, int labelRes, View.OnClickListener click) {
        LinearLayout box = t.column();
        box.setGravity(Gravity.CENTER);
        box.setBackground(t.rippleOn(t.tile, 16f));
        box.setClickable(true);
        box.setOnClickListener(click);
        box.addView(t.icon(iconRes, t.text, 24));
        TextView label = t.text(getString(labelRes), 13f, t.text);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = t.dp(6);
        box.addView(label, lp);
        return box;
    }

    private LinearLayout.LayoutParams tileLp(int leftMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, t.dp(70), 1f);
        lp.leftMargin = leftMargin;
        return lp;
    }

    /** 收起底部三格工具栏（幂等，不切换）。 */
    private void closePanel() {
        if (uploadPanel == null || uploadIcon == null) return;
        Motion.fadeOut(uploadPanel, Motion.DUR_OVERLAY_IN, new Runnable() {
            @Override
            public void run() {
                uploadPanel.setVisibility(View.GONE);
            }
        }).start();
        uploadIcon.setImageResource(R.drawable.ic_upload_add);
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

    /** 动作键三态：空 = 语音 / 有字 = 发送；发送中禁用。 */
    private void renderAction() {
        if (actionButton == null || actionIcon == null) return;
        boolean typed = input != null && input.getText().toString().trim().length() > 0;
        if (typed) {
            // 有字：实心品牌色圆 + 白色发送箭头（圆由背景提供，图标不带圈）。
            actionRing.setBackground(t.pill(t.accent));
            actionIcon.setImageResource(R.drawable.ic_send);
            actionIcon.setColorFilter(t.onAccent);
            sizeIcon(actionIcon, 18);
        } else {
            // 空输入：去掉背景圈，只留 ic_voice26 自带的细圈，与官方一致。
            actionRing.setBackground(null);
            actionIcon.setImageResource(R.drawable.ic_voice26);
            actionIcon.setColorFilter(t.text);
            sizeIcon(actionIcon, 26);
        }
        actionButton.setEnabled(!sending);
        actionButton.setAlpha(sending ? 0.45f : 1f);
    }

    /** 图标按状态换尺寸：带圈图标 26dp，实心发送键 18dp。 */
    private void sizeIcon(ImageView view, int sizeDp) {
        ViewGroup.LayoutParams lp = view.getLayoutParams();
        if (lp != null && lp.width == t.dp(sizeDp) && lp.height == t.dp(sizeDp)) return;
        FrameLayout.LayoutParams next = new FrameLayout.LayoutParams(t.dp(sizeDp), t.dp(sizeDp), Gravity.CENTER);
        view.setLayoutParams(next);
        view.requestLayout();
    }

    private void setSending(boolean value) {
        sending = value;
        renderAction();
    }

    /* ------------------------------------------------------------------ */
    /* 选图                                                               */
    /* ------------------------------------------------------------------ */

    private void takePhoto() {
        togglePanel();
        try {
            shotFile = new File(Shot.dir(this), "shot-" + System.currentTimeMillis() + ".jpg");
            Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, Shot.uriFor(shotFile));
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(intent, REQ_SHOT);
        } catch (android.content.ActivityNotFoundException error) {
            toast(getString(R.string.composer_camera_note));
        }
    }

    private void choose() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        startActivityForResult(intent, REQ_PICK);
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

    private void listenSpeech() {
        Intent intent = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE,
                Locale.getDefault().toString());
        intent.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT,
                getString(R.string.composer_hold_to_talk));
        try {
            startActivityForResult(intent, REQ_ASR);
        } catch (android.content.ActivityNotFoundException error) {
            toast(getString(R.string.composer_voice_note));
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

    private void accept(final Uri uri) {
        toast(getString(R.string.mn_reading_image));
        Pick.read(this, uri, new Pick.Callback() {
            @Override
            public void onOk(final Pick.Pending item) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        if (pending.size() >= Pick.maxImages()) {
                            toast(getString(R.string.mn_image_limit, Pick.maxImages()));
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
                        toast(getString(R.string.mn_image_unreadable, message));
                    }
                });
            }
        });
    }

    /** 附件条：52dp 缩略图 + 右上角 ✕。 */
    private void renderStrip() {
        if (attachStrip == null) return;
        // 与 ChatActivity.renderStrip 对称：显隐判定不变（只看 pending 是否为空），动画只加在两端。
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
            FrameLayout box = new FrameLayout(this);

            ImageView thumb = new ImageView(this);
            thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
            thumb.setBackground(t.round(t.surfaceAlt, 10f));
            try {
                byte[] raw = Base64.decode(item.data, Base64.DEFAULT);
                thumb.setImageBitmap(decodeSmall(raw, t.dp(52)));
            } catch (Throwable ignore) {
            }
            box.addView(thumb, new FrameLayout.LayoutParams(t.dp(52), t.dp(52)));

            FrameLayout remove = new FrameLayout(this);
            remove.setBackground(t.circle(0xCC000000));
            TextView cross = t.text("✕", 10f, 0xFFFFFFFF);
            remove.addView(cross, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
            remove.setClickable(true);
            remove.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    if (slot < pending.size()) pending.remove(slot);
                    renderStrip();
                }
            });
            FrameLayout.LayoutParams removeLp = new FrameLayout.LayoutParams(t.dp(18), t.dp(18));
            removeLp.gravity = Gravity.TOP | Gravity.RIGHT;
            box.addView(remove, removeLp);

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(t.dp(52), t.dp(52));
            lp.rightMargin = t.dp(8);
            attachStrip.addView(box, lp);
        }
    }

    private Bitmap decodeSmall(byte[] raw, int target) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
        int sample = 1;
        int longest = Math.max(bounds.outWidth, bounds.outHeight);
        while (longest / sample > target * 2) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        return BitmapFactory.decodeByteArray(raw, 0, raw.length, options);
    }

    /* ------------------------------------------------------------------ */
    /* 抽屉                                                               */
    /* ------------------------------------------------------------------ */

    /** 会话列表的滚动容器（抽屉与归档页共用同一份）。 */
    private void makeList() {
        listScroll = new ScrollView(this);
        listScroll.setFillViewport(true);
        listScroll.setClipToPadding(false);
        listScroll.setVerticalScrollBarEnabled(false);
        listScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        list = t.column();
        list.setPadding(t.dp(8), 0, t.dp(8), t.dp(16));
        listScroll.addView(list);
    }

    /**
     * 归档箱顶栏：‹ 返回 + 居中「归档箱」+ ↻ 刷新。
     * 归档页是独立页面（不是首页套抽屉），所以它自带一条真正的标题栏。
     */
    private View archiveHeader() {
        LinearLayout bar = t.row();
        bar.setPadding(t.dp(6), t.dp(6), t.dp(6), t.dp(2));
        bar.setBackgroundColor(t.bg);

        FrameLayout back = t.iconButton(R.drawable.ic_back, t.text, 21, 44);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                leaveArchive();
            }
        });
        bar.addView(back);

        LinearLayout center = t.column();
        center.setGravity(Gravity.CENTER);
        archiveTitle = t.strong(getString(R.string.mn_archive_title), 16f, t.text);
        archiveTitle.setGravity(Gravity.CENTER);
        center.addView(archiveTitle);
        // 第二行标出这是哪台电脑的归纳箱：多主机切换后必须能看出归属。
        TextView host = t.text(hostLine(), 10f, t.muted);
        host.setGravity(Gravity.CENTER);
        host.setSingleLine(true);
        host.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        host.setPadding(t.dp(4), t.dp(2), t.dp(4), 0);
        center.addView(host);
        bar.addView(center, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        FrameLayout refresh = t.iconButton(R.drawable.ic_refresh, t.text, 19, 44);
        refresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                load(true);
            }
        });
        bar.addView(refresh);
        return bar;
    }

    /** 退出归档页：归档页永远是独立实例，直接结束即可（回到列表/设置）。 */
    private void leaveArchive() {
        Nav.close(this);
    }

    private LinearLayout drawerBody() {
        LinearLayout panel = t.column();
        panel.setBackgroundColor(t.surface);

        headBox = t.column();
        panel.addView(headBox);

        FrameLayout body = new FrameLayout(this);
        panel.addView(body, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        makeList();
        body.addView(listScroll, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        batchBar = batchBottomBar();
        batchBar.setVisibility(View.GONE);
        body.addView(batchBar, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        userBox = userRow();
        panel.addView(userBox);
        applyUser(Me.displayName(prefs), Me.avatar(this, prefs));

        renderHead();
        return panel;
    }

    private View userRow() {
        LinearLayout row = t.row();
        row.setPadding(t.dp(16), t.dp(10), t.dp(8), t.dp(18));
        row.setBackground(t.ripple(14f));
        row.setClickable(true);

        // 头像：有电脑端账号的头像就贴圆图，没有就用首字母兜底（同样的 34dp 圆）。
        userAvatar = new FrameLayout(this);
        userAvatar.setBackground(t.circle(t.accentSoft));
        userLetter = t.text("", 15f, t.accent);
        userLetter.setGravity(Gravity.CENTER);
        userLetter.setTypeface(null, android.graphics.Typeface.BOLD);
        userAvatar.addView(userLetter, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        userPhoto = new ImageView(this);
        userPhoto.setScaleType(ImageView.ScaleType.FIT_XY);
        userPhoto.setVisibility(View.GONE);
        userAvatar.addView(userPhoto, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        row.addView(userAvatar, new LinearLayout.LayoutParams(t.dp(34), t.dp(34)));

        LinearLayout texts = t.column();
        // 标题是电脑端登录的账号（昵称 → ID → App 名），不是写死的 App 名。
        userNameView = t.text(Me.displayName(prefs), 16f, t.text);
        // 副标题显示「这台手机现在连的是哪台电脑」——多主机切换后必须一眼能认出归属。
        TextView device = t.text(hostLine(), 11f, t.muted);
        texts.addView(userNameView);
        texts.addView(device);
        LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        textLp.leftMargin = t.dp(10);
        row.addView(texts, textLp);

        FrameLayout more = t.iconButton(R.drawable.ic_more, t.muted, 18, 40);
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
                // openSettings() 内部先 closeDrawerNow() 再起页面：不会有「抽屉还在滑、设置页已经进场」的重叠帧。
                openSettings();
            }
        });
        return row;
    }

    /** 把账号栏刷成「电脑端登录的谁」：昵称 + 圆形头像，没有头像就用首字母。 */
    private void applyUser(String name, Bitmap avatar) {
        if (userNameView != null) {
            String shown = name == null ? "" : name.trim();
            userNameView.setText(shown.length() > 0 ? shown : Me.displayName(prefs));
        }
        if (userAvatar == null || userLetter == null || userPhoto == null) return;
        Bitmap source = avatar != null ? avatar : Me.avatar(this, prefs);
        Bitmap round = source == null ? null : Me.circle(source, t.dp(34));
        if (round != null) {
            userPhoto.setImageBitmap(round);
            userPhoto.setVisibility(View.VISIBLE);
            userLetter.setVisibility(View.GONE);
            return;
        }
        userPhoto.setVisibility(View.GONE);
        userLetter.setVisibility(View.VISIBLE);
        String shown = userNameView == null ? Me.displayName(prefs)
                : String.valueOf(userNameView.getText());
        userLetter.setText(initial(shown));
    }

    private String initial(String value) {
        String text = value == null ? "" : value.trim();
        if (text.length() == 0) return "?";
        return text.substring(0, 1).toUpperCase(java.util.Locale.ROOT);
    }

    /** 抽屉副标题：当前主机名 · 设备名（没配对时退回标语）。 */
    private String hostLine() {
        Hosts.Entry active = Hosts.active(prefs);
        String host = active == null ? "" : Hosts.title(active);
        String name = host.length() > 0 ? host : Prefs.normalize(prefs.address());
        if (name.length() == 0) return App.slogan(this);
        String device = prefs.device();
        return device.length() > 0 ? name + " · " + device : name;
    }

    /**
     * 当前视图真正要显示的会话：归档视图不过滤，主视图按选中的工作区过滤（cwd 一致），
     * 跟电脑端侧栏的分组一致。列表与搜索页共用同一份口径。
     */
    private List<JSONObject> visibleSessions() {
        if (archivedView || wsSelected.length() == 0) return sessions;
        List<JSONObject> out = new ArrayList<JSONObject>();
        for (int index = 0; index < sessions.size(); index++) {
            JSONObject row = sessions.get(index);
            if (wsSelected.equalsIgnoreCase(row.optString("cwd", ""))) out.add(row);
        }
        return out;
    }

    /**
     * 打开归档箱：起一个独立的归档页实例（不再在当前实例里就地切视图）。
     *
     * 就地切视图有两个坑：抽屉收起后主区是首页欢迎页+输入卡，看着像没进去；
     * 而且当前实例的抽屉/搜索页/多选态会跟归档态互相污染。独立页面把这些问题
     * 一次解决，返回键也回到原来的列表（或设置页）。
     */
    private void openArchive() {
        pushIn(new Intent(this, MainActivity.class).putExtra("archive", true));
    }

    private void openSettings() {
        pushIn(new Intent(this, SettingsActivity.class));
    }

    /**
     * 统一的「进入下一屏」：先把抽屉无动画地收掉，再起 Activity 并接管转场。
     *
     * 之前在抽屉里直接 startActivity 会叠三层动画：抽屉 190ms 滑出 + 遮罩淡出 + 系统默认的
     * Activity 缩放入场，三套曲线互不同步，点一下就是「闪一下」。现在抽屉同步落位（没有中间帧），
     * 只留一条 200ms 的右进转场，方向清楚、合成层也少。
     */
    private void pushIn(Intent intent) {
        closeDrawerNow();
        Nav.open(this, intent);
    }

    /** 抽屉 ⋯ 菜单：跟「在线主机」页同一套卡片菜单，深浅色都跟主题走。 */
    private void drawerMenu() {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(0, t.dp(6), 0, t.dp(8));

        TextView head = t.strong(hostLine(), 13f, t.muted);
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
                        pushIn(new Intent(MainActivity.this, HostsActivity.class));
                    } else if (which == 1) {
                        openArchive();
                    } else if (which == 2) {
                        load(true);
                    } else if (which == 3) {
                        pushIn(new Intent(MainActivity.this, PairActivity.class));
                    } else {
                        closeDrawer();
                        openSettings();
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

    /** 抽屉头：常态是搜索胶囊，多选态是「选择对话」+ ✕ + 已选计数。 */
    private void renderHead() {
        if (headBox == null) return;
        headBox.removeAllViews();
        batchCount = null;

        if (batchMode) {
            LinearLayout row = t.row();
            row.setPadding(t.dp(10), t.dp(20), t.dp(6), 0);
            TextView title = t.strong(getString(R.string.select_chat_title), 17f, t.text);
            row.addView(title, new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            FrameLayout close = t.iconButton(R.drawable.ic_close, t.text, 18, 40);
            close.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    endBatch();
                }
            });
            row.addView(close);
            headBox.addView(row);

            TextView count = t.text(getString(R.string.session_batch_selected_count, selected.size()), 12f, t.muted);
            count.setPadding(t.dp(14), t.dp(2), t.dp(14), t.dp(10));
            batchCount = count;
            headBox.addView(count);
            return;
        }

        LinearLayout pill = t.row();
        // 官方抽屉的搜索框是中性灰胶囊（不是 chip 的浅蓝底）。
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
                openSearch();
            }
        });

        LinearLayout.LayoutParams pillLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(38));
        pillLp.leftMargin = t.dp(14);
        pillLp.rightMargin = t.dp(14);
        pillLp.topMargin = t.dp(20);
        pillLp.bottomMargin = t.dp(10);
        headBox.addView(pill, pillLp);

        // 归档视图不渲染工作区 chips：归档箱不认工作区，别给用户一个改不动结果的开关。
        if (!wsNames.isEmpty() && !archivedView) headBox.addView(workspaceChips());
    }

    /**
     * 工作区切换：电脑端 harness 的工作区（WhaleRealm / PhoneHarness / test …）。
     * 「全部」= 不按目录过滤；选中某个工作区后，列表只显示它下面的对话，
     * 新对话也发到这个目录，跟电脑端侧栏的工作区分组一致。
     */
    private View workspaceChips() {
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setClipToPadding(false);
        scroll.setPadding(t.dp(14), 0, t.dp(14), 0);

        LinearLayout row = t.row();
        scroll.addView(row);

        row.addView(workspaceChip(getString(R.string.mn_ws_all), "", wsSelected.length() == 0));

        // 目录集合 = 电脑端给的工作区 + 会话里出现过但没登记的目录（例如直接开在子目录的会话），
        // 否则那些对话在工作区视角下会凭空消失。
        List<String> dirs = new ArrayList<String>();
        List<String> names = new ArrayList<String>();
        for (int index = 0; index < wsCwds.size(); index++) {
            dirs.add(wsCwds.get(index));
            names.add(wsNames.get(index));
        }
        for (int index = 0; index < sessions.size(); index++) {
            String dir = sessions.get(index).optString("cwd", "");
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
        for (int index = 0; index < dirs.size(); index++) {
            final String dir = dirs.get(index);
            String name = index < names.size() ? names.get(index) : "";
            if (name.length() == 0 || name.equalsIgnoreCase(dir)) name = shortName(dir);
            row.addView(workspaceChip(name, dir, dir.equals(wsSelected)));
        }
        return scroll;
    }

    private View workspaceChip(String label, final String dir, boolean on) {
        TextView chip = t.text(label, 13f, on ? t.accent : t.text);
        chip.setSingleLine(true);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(t.dp(12), 0, t.dp(12), 0);
        chip.setBackground(on ? t.pill(t.accentSoft) : t.roundStroke(t.surface, t.line, 15f));
        chip.setClickable(true);
        chip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (archivedView) return;
                if (dir.equals(wsSelected)) return;
                wsSelected = dir;
                if (dir.length() > 0) {
                    prefs.setWorkspace(dir, nameIn(wsCwds.indexOf(dir)));
                    cwd = dir;
                } else {
                    prefs.setWorkspace("", "");
                    cwd = wsCwds.isEmpty() ? "" : wsCwds.get(0);
                }
                renderHead();
                render();
            }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30));
        lp.rightMargin = t.dp(8);
        chip.setLayoutParams(lp);
        return chip;
    }

    private String nameIn(int index) {
        if (index < 0 || index >= wsNames.size()) return "";
        String name = wsNames.get(index);
        String dir = wsCwds.get(index);
        // 电脑端还没重启插件时 title 就是路径，别把整条路径当工作区名存下来。
        if (name == null || name.length() == 0 || name.equalsIgnoreCase(dir)) return shortName(dir);
        if (name.indexOf('\\') >= 0 || name.indexOf('/') >= 0) return shortName(name);
        return name;
    }

    /** 目录的最后一段当工作区名（和电脑端「工作区」里显示的目录一致）。 */
    private String shortName(String dir) {
        String value = dir == null ? "" : dir.trim();
        while (value.length() > 1
                && (value.endsWith("\\") || value.endsWith("/"))) {
            value = value.substring(0, value.length() - 1);
        }
        int cut = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
        if (cut >= 0 && cut + 1 < value.length()) return value.substring(cut + 1);
        return value;
    }

    private View groupHeader(String label, boolean multi) {
        LinearLayout row = t.row();
        row.setPadding(t.dp(10), t.dp(20), t.dp(6), t.dp(4));
        TextView title = t.text(label, 13f, t.muted);
        row.addView(title, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        if (multi) {
            LinearLayout button = t.row();
            button.setPadding(t.dp(6), t.dp(4), t.dp(6), t.dp(4));
            button.setBackground(t.ripple(10f));
            button.setClickable(true);
            button.addView(t.icon(R.drawable.ic_batch, t.muted, 14));
            TextView text = t.text(getString(R.string.session_batch_entry_button), 12f, t.muted);
            LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            textLp.leftMargin = t.dp(4);
            button.addView(text, textLp);
            button.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    startBatch();
                }
            });
            row.addView(button);
        }
        return row;
    }

    /** 抽屉里的一行：只有标题（官方不显示预览行与置顶胶囊）。 */
    private View drawerRow(final JSONObject row) {
        final String id = row.optString("id", "");
        String title = row.optString("title", "");
        if (title.length() == 0) title = getString(R.string.session_untitled);

        // 「这一轮还没跑完」= 服务端 timeline 仍在 running（见 plugin/lib/projection.js 的 turn/start / turn/end）。
        final String status = row.optString("status", "idle");
        final boolean running = "running".equals(status);
        final boolean failed = "failed".equals(status);
        // 「已完成且未读」：跑过至少一轮（itemCount > 0）且这一轮的条数比本地记的「读到第几条」多。
        // 点了这行（进了这个会话）就记账成已读，绿点随之消失 —— 见 Read.java。
        final boolean unread = Read.unread(this, row);

        LinearLayout cell = t.row();
        cell.setPadding(t.dp(10), 0, t.dp(10), 0);
        cell.setMinimumHeight(t.dp(44));
        cell.setBackground(t.ripple(14f));
        cell.setClickable(true);

        // 行首状态槽：和主机 harness 侧栏一样，每行最左留一枚固定槽位 ——
        //   多选 → 选择圈；ongoing → 转圈（StateRing，与主机 spinner 同规格）；
        //   error → 红点（data-state=error）；done 且未读 → 绿点（data-state=done）；已读 → 不画；
        //   其余（从没跑过）→ 空 View 占位 —— 空位也占住，否则有会话在跑时整列标题会左右跳一格。
        LinearLayout.LayoutParams slotLp = new LinearLayout.LayoutParams(t.dp(20), t.dp(20), 0f);
        slotLp.rightMargin = t.dp(8);
        slotLp.gravity = Gravity.CENTER_VERTICAL;
        if (batchMode) {
            cell.addView(selectDot(selected.contains(id)), slotLp);
        } else if (running) {
            cell.addView(new StateRing(this, t), slotLp);
        } else if (failed) {
            cell.addView(new StateDot(this, t, t.bad), slotLp);
        } else if (unread) {
            cell.addView(new StateDot(this, t, t.ok), slotLp);
        } else {
            cell.addView(new View(this), slotLp);
        }

        TextView name = t.text(title, 16f, t.text);
        name.setMaxLines(1);
        name.setEllipsize(TextUtils.TruncateAt.END);
        cell.addView(name, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        cell.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (batchMode) {
                    toggleSelect(id);
                } else {
                    // 进了这个会话就算读过：绿点（已完成且未读）在这里落账。
                    Read.markRead(MainActivity.this, row);
                    open(row);
                }
            }
        });
        cell.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View view) {
                if (batchMode) return false;
                // 归档页长按是归档专用菜单（打开 / 恢复 / 复制对话 ID）。
                if (archivedView) archivedMenu(row);
                else menu(row);
                return true;
            }
        });
        return cell;
    }

    private View selectDot(boolean on) {
        FrameLayout box = new FrameLayout(this);
        View circle = new View(this);
        circle.setBackground(on
                ? t.circle(t.accent)
                : t.roundStroke(0x00000000, t.muted2, 10f));
        box.addView(circle, new FrameLayout.LayoutParams(t.dp(20), t.dp(20)));
        if (on) {
            ImageView check = new ImageView(this);
            check.setImageResource(R.drawable.ic_check);
            check.setColorFilter(t.onAccent);
            box.addView(check, new FrameLayout.LayoutParams(t.dp(12), t.dp(12), Gravity.CENTER));
        }
        return box;
    }

    private LinearLayout batchBottomBar() {
        LinearLayout bar = t.column();
        bar.setBackgroundColor(t.surface);
        bar.addView(t.hairline());

        LinearLayout row = t.row();
        row.setPadding(0, t.dp(2), 0, t.dp(2));
        row.addView(batchAction(R.drawable.ic_pin, getString(R.string.mn_action_pin), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                batchPin();
            }
        }), new LinearLayout.LayoutParams(0, t.dp(50), 1f));

        View split = new View(this);
        split.setBackgroundColor(t.line);
        row.addView(split, new LinearLayout.LayoutParams(Math.max(1, t.dp(0.7f)), t.dp(22)));

        row.addView(batchAction(R.drawable.ic_trash, getString(R.string.mn_action_delete), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                batchDelete();
            }
        }), new LinearLayout.LayoutParams(0, t.dp(50), 1f));

        bar.addView(row);
        return bar;
    }

    private View batchAction(int iconRes, String label, View.OnClickListener click) {
        LinearLayout box = t.row();
        box.setGravity(Gravity.CENTER);
        box.setClickable(true);
        box.setBackground(t.ripple(0f));
        box.setOnClickListener(click);
        box.addView(t.icon(iconRes, t.text, 17));
        TextView text = t.text(label, 14f, t.text);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.leftMargin = t.dp(6);
        box.addView(text, lp);
        return box;
    }

    /* ------------------------------------------------------------------ */
    /* 多选                                                               */
    /* ------------------------------------------------------------------ */

    private void startBatch() {
        batchMode = true;
        selected.clear();
        renderHead();
        render();
        // 多选模式切换：判定完全不变（batchMode 仍是唯一状态来源），只把两个硬切换成 150ms 淡入淡出。
        if (userBox != null) Motion.fadeOut(userBox, Motion.DUR_TOGGLE, new Runnable() {
            @Override
            public void run() {
                if (batchMode) userBox.setVisibility(View.GONE);
            }
        }).start();
        if (batchBar != null) {
            Motion.cancel(batchBar);
            batchBar.setVisibility(View.VISIBLE);
            batchBar.setAlpha(0f);
            Motion.fadeIn(batchBar, Motion.DUR_TOGGLE).start();
        }
    }

    private void endBatch() {
        batchMode = false;
        selected.clear();
        renderHead();
        render();
        if (userBox != null) {
            Motion.cancel(userBox);
            userBox.setVisibility(View.VISIBLE);
            userBox.setAlpha(0f);
            Motion.fadeIn(userBox, Motion.DUR_TOGGLE).start();
        }
        if (batchBar != null) Motion.fadeOut(batchBar, Motion.DUR_TOGGLE, new Runnable() {
            @Override
            public void run() {
                if (!batchMode) batchBar.setVisibility(View.GONE);
            }
        }).start();
    }

    private void toggleSelect(String id) {
        if (selected.contains(id)) selected.remove(id);
        else selected.add(id);
        if (batchCount != null) {
            batchCount.setText(getString(R.string.session_batch_selected_count, selected.size()));
        }
        render();
        if (batchMode) renderHead();
    }

    private void batchPin() {
        if (selected.isEmpty()) {
            toast(getString(R.string.mn_select_first));
            return;
        }
        final List<String> ids = new ArrayList<String>(selected);
        batchStart(ids.size());
        for (String id : ids) {
            JSONObject body = new JSONObject();
            try {
                body.put("pinned", true);
            } catch (Exception ignore) {
            }
            api.post("/v1/sessions/" + Api.enc(id) + "/pin", body, new Api.Callback() {
                @Override
                public void onOk(JSONObject result) {
                    batchStep(true, "");
                }

                @Override
                public void onError(String message) {
                    batchStep(false, message);
                }
            });
        }
    }

    private void batchDelete() {
        if (selected.isEmpty()) {
            toast(getString(R.string.mn_select_first));
            return;
        }
        final List<String> ids = new ArrayList<String>(selected);
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.mn_delete_batch_title, ids.size()))
                .setMessage(getString(R.string.mn_delete_batch_message))
                .setPositiveButton(getString(R.string.mn_action_delete), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        batchStart(ids.size());
                        for (String id : ids) {
                            api.post("/v1/sessions/" + Api.enc(id) + "/archive", new JSONObject(),
                                    new Api.Callback() {
                                        @Override
                                        public void onOk(JSONObject result) {
                                            batchStep(true, "");
                                        }

                                        @Override
                                        public void onError(String message) {
                                            batchStep(false, message);
                                        }
                                    });
                        }
                    }
                })
                .setNegativeButton(getString(R.string.mn_cancel), null)
                .show();
    }

    private void batchStart(int total) {
        batchTotal = total;
        batchDone = 0;
        batchOk = true;
        batchError = "";
    }

    private void batchStep(boolean ok, String message) {
        if (!ok) {
            batchOk = false;
            if (batchError.length() == 0) batchError = message;
        }
        batchDone++;
        if (batchDone < batchTotal) return;
        final boolean allOk = batchOk;
        final String error = batchError;
        ui.post(new Runnable() {
            @Override
            public void run() {
                endBatch();
                load(false);
                if (allOk) toast(getString(R.string.mn_batch_done));
                else toast(getString(R.string.mn_batch_partial, error));
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* 搜索页                                                             */
    /* ------------------------------------------------------------------ */

    private View searchBody() {
        LinearLayout page = t.column();
        page.setBackgroundColor(t.bg);

        LinearLayout top = t.row();
        top.setPadding(t.dp(6), t.dp(8), t.dp(12), t.dp(8));
        FrameLayout back = t.iconButton(R.drawable.ic_back, t.text, 20, 44);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                closeSearch();
            }
        });
        top.addView(back);

        LinearLayout pill = t.row();
        pill.setBackground(t.round(t.surfaceAlt, 20f));
        pill.setPadding(t.dp(14), 0, t.dp(10), 0);
        pill.addView(t.icon(R.drawable.ic_search, t.muted, 16));

        searchInput = new EditText(this);
        searchInput.setBackground(null);
        searchInput.setHint(getString(R.string.search_hint));
        searchInput.setHintTextColor(t.muted);
        searchInput.setTextColor(t.text);
        searchInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        searchInput.setSingleLine(true);
        searchInput.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchInput.setPadding(t.dp(8), 0, 0, 0);
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                renderSearch(s == null ? "" : s.toString().trim());
            }
        });
        pill.addView(searchInput, new LinearLayout.LayoutParams(
                0, t.dp(40), 1f));
        top.addView(pill, new LinearLayout.LayoutParams(0, t.dp(40), 1f));
        page.addView(top);

        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setClipToPadding(false);
        scroller.setVerticalScrollBarEnabled(false);
        scroller.setOverScrollMode(View.OVER_SCROLL_NEVER);
        searchList = t.column();
        searchList.setPadding(t.dp(6), t.dp(4), t.dp(6), t.dp(24));
        scroller.addView(searchList);
        page.addView(scroller, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        return page;
    }

    private void openSearch() {
        closeDrawer();
        if (sessions.isEmpty()) load(false);
        // 退出淡出可能还在跑：先取消，避免上一轮的 endAction 把刚打开的页又藏回去。
        Motion.cancel(searchPage);
        searchPage.setVisibility(View.VISIBLE);
        searchPage.setAlpha(0f);
        Motion.fadeIn(searchPage, Motion.DUR_OVERLAY_IN).start();
        searchInput.setText("");
        searchInput.requestFocus();
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                android.view.inputmethod.InputMethodManager keyboard =
                        (android.view.inputmethod.InputMethodManager)
                                getSystemService(INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.showSoftInput(searchInput, 0);
            }
        }, 120);
        renderSearch("");
    }

    private void closeSearch() {
        android.view.inputmethod.InputMethodManager keyboard =
                (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (keyboard != null && searchInput != null) keyboard.hideSoftInputFromWindow(
                searchInput.getWindowToken(), 0);
        Motion.fadeOut(searchPage, Motion.DUR_OVERLAY_IN, new Runnable() {
            @Override
            public void run() {
                searchPage.setVisibility(View.GONE);
            }
        }).start();
    }

    /** 本地过滤：标题命中优先，其次最后一句。宿主没有检索接口，官方服务端检索这里不外发。 */
    private void renderSearch(String query) {
        if (searchList == null) return;
        searchList.removeAllViews();
        String needle = query == null ? "" : query.toLowerCase(Locale.US);
        int hits = 0;
        List<JSONObject> pool = visibleSessions();
        for (int index = 0; index < pool.size(); index++) {
            final JSONObject row = pool.get(index);
            String title = row.optString("title", "");
            String last = row.optString("lastText", "");
            boolean hit = needle.length() == 0
                    || title.toLowerCase(Locale.US).contains(needle)
                    || last.toLowerCase(Locale.US).contains(needle);
            if (!hit) continue;
            hits++;
            LinearLayout cell = t.column();
            cell.setPadding(t.dp(12), t.dp(11), t.dp(12), t.dp(11));
            cell.setBackground(t.ripple(12f));
            cell.setClickable(true);
            TextView name = t.text(title.length() == 0 ? getString(R.string.session_untitled) : title,
                    15f, t.text);
            name.setMaxLines(1);
            name.setEllipsize(TextUtils.TruncateAt.END);
            cell.addView(name);
            if (last.length() > 0) {
                TextView preview = t.text(last.replace('\n', ' '), 12f, t.muted);
                preview.setMaxLines(2);
                preview.setEllipsize(TextUtils.TruncateAt.END);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.topMargin = t.dp(3);
                cell.addView(preview, lp);
            }
            final String id = row.optString("id", "");
            cell.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    closeSearch();
                    open(row);
                }
            });
            searchList.addView(cell);
        }
        if (hits == 0) {
            TextView empty = t.text(needle.length() == 0
                    ? getString(R.string.mn_search_hint_empty)
                    : getString(R.string.mn_search_no_hit),
                    13f, t.muted);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, t.dp(40), 0, 0);
            searchList.addView(empty);
        }
        if (hits > 0 && needle.length() > 0) {
            TextView count = t.text(getString(R.string.mn_search_found, hits), 12f, t.muted);
            count.setPadding(t.dp(12), t.dp(14), t.dp(12), t.dp(6));
            searchList.addView(count, 0);
        }
    }

    /* ------------------------------------------------------------------ */
    /* 数据                                                               */
    /* ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ */
    /* 进行中轮询                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * 有会话正在跑时，抽屉静默刷一次列表的间隔。
     *
     * 为什么必须有：手机端「没完成」的唯一来源是 GET /v1/sessions 里的 status
     * （plugin/lib/runtime.js:632 listSessions → row.status），列表本身不推流
     * （SSE 那条链路是单个会话的详情，见 Sse.java）。不轮询的话，电脑端把这一轮跑完、
     * 手机还停在抽屉里时，行首的环会一直转 —— 那和「这个对话永远没完成」没区别。
     * 只有「抽屉开着 + 确实有 running 行」时才排，转完自动停，不常驻。
     */
    private static final long RUNNING_POLL_MS = 5000;

    private final Runnable runningPoll = new Runnable() {
        @Override
        public void run() {
            if (isFinishing() || !drawerOpen) return;
            load(false);
        }
    };

    /** 按「抽屉开着 + 有 running 行」决定要不要排下一次；幂等（先撤再排）。 */
    private void syncRunningPoll() {
        ui.removeCallbacks(runningPoll);
        if (isFinishing() || !drawerOpen) return;
        List<JSONObject> visible = visibleSessions();
        for (int index = 0; index < visible.size(); index++) {
            if ("running".equals(visible.get(index).optString("status", "idle"))) {
                ui.postDelayed(runningPoll, RUNNING_POLL_MS);
                return;
            }
        }
    }

    private void load(final boolean loud) {
        if (loud) toast(getString(R.string.mn_refreshing));
        api.get(archivedView ? "/v1/sessions?archived=1" : "/v1/sessions", new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        sessions.clear();
                        JSONArray array = body.optJSONArray("sessions");
                        if (array == null) array = new JSONArray();
                        for (int index = 0; index < array.length(); index++) {
                            JSONObject row = array.optJSONObject(index);
                            if (row != null) sessions.add(row);
                        }
                        // 内容没变就不重建（同一份列表反复 remove/add 是掉帧的主要来源）。
                        if (!listSignature().equals(renderedSig)) render();
                        // 指纹没变也要重排：轮询靠的就是「每次都问一下还有没有 running」。
                        syncRunningPoll();
                        if (loud) toast(getString(R.string.mn_refreshed, sessions.size()));
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        renderError(message);
                    }
                });
            }
        });
    }

    private void renderError(String message) {
        if (list == null) return;
        renderedSig = null;
        list.removeAllViews();
        LinearLayout box = t.column();
        box.setPadding(t.dp(12), t.dp(30), t.dp(12), 0);
        box.addView(t.text(getString(R.string.mn_offline_title), 15f, t.text));
        TextView hint = t.text(message + getString(R.string.mn_offline_hint), 12f, t.muted);
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintLp.topMargin = t.dp(8);
        hintLp.bottomMargin = t.dp(14);
        box.addView(hint, hintLp);
        TextView retry = t.text(getString(R.string.mn_retry), 14f, t.accent);
        retry.setClickable(true);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                load(false);
            }
        });
        box.addView(retry);
        list.addView(box);
    }

    /**
     * 当前列表的内容指纹：视图真正会显示什么，只把影响显示的东西算进去。
     * 主题、工作区、归档/多选态一变就必须重建；标题、置顶、归档标记、最后一句变了也要重建。
     */
    private String listSignature() {
        StringBuilder sb = new StringBuilder(128);
        sb.append(t.dark ? 'D' : 'L').append(archivedView ? 'A' : 'M')
                .append(batchMode ? 'B' : '-').append('|').append(wsSelected).append('|');
        List<JSONObject> visible = visibleSessions();
        for (int index = 0; index < visible.size(); index++) {
            JSONObject row = visible.get(index);
            sb.append(row.optString("id", "")).append('\u0001')
                    .append(row.optString("title", "")).append('\u0001')
                    .append(row.optBoolean("pinned", false) ? '1' : '0')
                    .append(row.optBoolean("archived", false) ? '1' : '0')
                    .append(row.optString("lastText", "")).append('\u0001')
                    // status 必须进指纹：它是「行首转圈」的唯一依据，turn 结束后若指纹不变，
                    // render() 就不会跑，环会一直转到下次进页面 —— 这就是「没完成的对话」看起来永远没完成。
                    .append(row.optString("status", "idle"))
                    // 「已完成且未读」也要进指纹：空会话发出第一轮又很快结束（两个 5s 轮询之间）时，
                    // status 前后都是 idle，只有条数从 0 变正 —— 不记这一位，绿点就要等到下次重开抽屉才出现；
                    // 反过来点了行之后已读、绿点该消失，也得靠这一位触发重建。
                    // 只记 0/1 而不是真实条数：条数在一轮里反复变，记进去等于每次轮询都重建整张列表。
                    .append(Read.unread(this, row) ? '1' : '0').append('\u0002');
        }
        if (batchMode) sb.append(selected.toString());
        return sb.toString();
    }

    private void render() {
        if (list == null) return;
        renderedSig = listSignature();
        list.removeAllViews();

        // 归档箱不认工作区：宿主返回的就是全部归档会话，再按 cwd 过滤会把「有数据」判成空。
        List<JSONObject> visible = visibleSessions();
        if (archiveTitle != null) {
            archiveTitle.setText(visible.isEmpty()
                    ? getString(R.string.mn_archive_title)
                    : getString(R.string.mn_archive_title_count, visible.size()));
        }

        if (visible.isEmpty()) {
            LinearLayout box = t.column();
            box.setPadding(t.dp(12), t.dp(40), t.dp(12), 0);
            String emptyText;
            if (archivedView) emptyText = getString(R.string.mn_empty_archive);
            else if (wsSelected.length() > 0) emptyText = getString(R.string.mn_empty_workspace);
            else emptyText = getString(R.string.session_list_empty_title);
            TextView empty = t.text(emptyText, 15f, t.text);
            empty.setGravity(Gravity.CENTER);
            box.addView(empty);
            TextView hint = t.text(archivedView
                    ? getString(R.string.mn_empty_archive_remote)
                    : getString(R.string.session_list_empty_description), 12f, t.muted);
            hint.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.topMargin = t.dp(10);
            box.addView(hint, lp);
            list.addView(box);
            return;
        }

        String group = "";
        boolean multiShown = false;
        for (int index = 0; index < visible.size(); index++) {
            JSONObject row = visible.get(index);
            String label = groupOf(row);
            if (!label.equals(group)) {
                group = label;
                boolean multi = !batchMode && !archivedView && !label.equals(getString(R.string.mn_group_pinned))
                        && !multiShown;
                if (multi) multiShown = true;
                list.addView(groupHeader(label, multi));
            }
            list.addView(drawerRow(row));
        }
    }

    private String groupOf(JSONObject row) {
        if (row.optBoolean("pinned", false)) return getString(R.string.mn_group_pinned);
        return groupOf(row.optLong("updatedAt", 0L));
    }

    private String groupOf(long ms) {
        Calendar now = Calendar.getInstance();
        Calendar then = Calendar.getInstance();
        if (ms > 0) then.setTimeInMillis(ms);
        else then = now;
        SimpleDateFormat day = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        String today = day.format(now.getTime());
        String target = day.format(then.getTime());
        if (today.equals(target)) return getString(R.string.session_history_timeline_label_today);
        now.add(Calendar.DAY_OF_YEAR, -1);
        if (day.format(now.getTime()).equals(target)) return getString(R.string.session_history_timeline_label_yesterday);
        now.add(Calendar.DAY_OF_YEAR, -6);
        if (then.compareTo(now) >= 0) return getString(R.string.session_history_timeline_label7_days);
        now.add(Calendar.DAY_OF_YEAR, -23);
        if (then.compareTo(now) >= 0) return getString(R.string.session_history_timeline_label30days);
        return getString(R.string.session_history_timeline_label_earlier);
    }

    private void open(JSONObject row) {
        String id = row.optString("id", "");
        if (id.length() == 0) return;
        Intent intent = new Intent(this, ChatActivity.class);
        intent.putExtra("sessionId", id);
        intent.putExtra("title", row.optString("title", getString(R.string.mn_untitled_session)));
        pushIn(intent);
    }

    /** 归档箱里的条目：点开是「恢复 / 打开」。 */
    private void archivedMenu(final JSONObject row) {
        final String id = row.optString("id", "");
        final String title = row.optString("title", "");
        final String[] items = new String[]{
                getString(R.string.mn_archive_menu_open),
                getString(R.string.mn_archive_menu_restore),
                getString(R.string.mn_copy_session_id)};
        new AlertDialog.Builder(this)
                .setTitle(title.length() == 0 ? getString(R.string.session_untitled) : title)
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        if (which == 0) open(row);
                        else if (which == 1) unarchive(id);
                        else copy(id);
                    }
                })
                .setNegativeButton(getString(R.string.mn_cancel), null)
                .show();
    }

    private void menu(final JSONObject row) {
        final String id = row.optString("id", "");
        final String title = row.optString("title", "");
        final boolean pinned = row.optBoolean("pinned", false);
        final boolean archived = row.optBoolean("archived", false);

        final List<String> items = new ArrayList<String>();
        // 下标分派：不再拿显示串当分派键（切语言不影响分派）。
        items.add(getString(pinned ? R.string.mn_action_unpin : R.string.mn_action_pin));
        items.add(getString(R.string.mn_action_rename));
        items.add(getString(archived ? R.string.mn_action_unarchive : R.string.mn_action_archive));
        items.add(getString(R.string.mn_copy_session_id));
        new AlertDialog.Builder(this)
                .setTitle(title.length() == 0 ? getString(R.string.session_untitled) : title)
                .setItems(items.toArray(new String[0]), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        if (which == 0) pin(id, !pinned);
                        else if (which == 1) rename(id, title);
                        else if (which == 2) {
                            if (archived) unarchive(id);
                            else archive(id);
                        } else copy(id);
                    }
                })
                .setNegativeButton(getString(R.string.mn_cancel), null)
                .show();
    }

    private void pin(final String id, final boolean next) {
        JSONObject body = new JSONObject();
        try {
            body.put("pinned", next);
        } catch (Exception ignore) {
        }
        api.post("/v1/sessions/" + Api.enc(id) + "/pin", body, new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(next ? getString(R.string.mn_toast_pinned) : getString(R.string.mn_toast_unpinned));
                        load(false);
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.mn_op_failed, message));
                    }
                });
            }
        });
    }

    private void unarchive(final String id) {
        api.post("/v1/sessions/" + Api.enc(id) + "/unarchive", new JSONObject(), new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.mn_toast_restored));
                        load(false);
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.mn_op_failed, message));
                    }
                });
            }
        });
    }

    private void rename(final String id, String current) {
        final EditText field = new EditText(this);
        field.setText(current);
        field.setSingleLine(true);
        field.setTextColor(t.text);
        field.setHintTextColor(t.muted);
        int pad = t.dp(18);
        field.setPadding(pad, pad, pad, pad);
        field.setSelectAllOnFocus(true);
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.mn_rename_title))
                .setView(field)
                .setPositiveButton(getString(R.string.mn_save), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String next = field.getText().toString().trim();
                        if (next.length() == 0) {
                            toast(getString(R.string.mn_title_required));
                            return;
                        }
                        JSONObject body = new JSONObject();
                        try {
                            body.put("title", next);
                        } catch (Exception ignore) {
                        }
                        api.post("/v1/sessions/" + Api.enc(id) + "/rename", body, new Api.Callback() {
                            @Override
                            public void onOk(JSONObject result) {
                                ui.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        toast(getString(R.string.mn_toast_renamed));
                                        load(false);
                                    }
                                });
                            }

                            @Override
                            public void onError(final String message) {
                                ui.post(new Runnable() {
                                    @Override
                                    public void run() {
                                        toast(getString(R.string.mn_rename_failed, message));
                                    }
                                });
                            }
                        });
                    }
                })
                .setNegativeButton(getString(R.string.mn_cancel), null)
                .show();
    }

    private void archive(final String id) {
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.mn_archive_confirm_title))
                .setMessage(getString(R.string.mn_archive_confirm_message))
                .setPositiveButton(getString(R.string.mn_action_archive), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        api.post("/v1/sessions/" + Api.enc(id) + "/archive", new JSONObject(),
                                new Api.Callback() {
                                    @Override
                                    public void onOk(JSONObject result) {
                                        ui.post(new Runnable() {
                                            @Override
                                            public void run() {
                                                toast(getString(R.string.mn_toast_archived));
                                                load(false);
                                            }
                                        });
                                    }

                                    @Override
                                    public void onError(final String message) {
                                        ui.post(new Runnable() {
                                            @Override
                                            public void run() {
                                                toast(getString(R.string.mn_archive_failed, message));
                                            }
                                        });
                                    }
                                });
                    }
                })
                .setNegativeButton(getString(R.string.mn_cancel), null)
                .show();
    }

    private void copy(String text) {
        ClipboardManager manager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (manager != null) manager.setPrimaryClip(ClipData.newPlainText("session", text));
        toast(getString(R.string.mn_toast_copied));
    }

    /* ------------------------------------------------------------------ */
    /* 发消息                                                             */
    /* ------------------------------------------------------------------ */

    private void send() {
        final String text = input.getText().toString().trim();
        final List<Pick.Pending> images = new ArrayList<Pick.Pending>(pending);
        if (text.length() == 0 && images.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (now - lastSendAt < 600L) return;

        if (cwd.length() == 0 || Seats.catalog() == null) {
            if (catalogTried) {
                toast(getString(R.string.mn_not_connected));
                return;
            }
            catalogTried = true;
            toast(getString(R.string.mn_connecting));
            ensureCatalog(new Runnable() {
                @Override
                public void run() {
                    lastSendAt = 0;
                    send();
                }
            });
            return;
        }

        lastSendAt = now;
        setSending(true);
        input.setText("");
        pending.clear();
        renderStrip();
        createSession(text, images);
    }

    private void createSession(final String text, final List<Pick.Pending> images) {
        JSONObject body = new JSONObject();
        try {
            body.put("cwd", cwd);
            body.put("text", text);
            body.put("requestId", "android-home-" + System.currentTimeMillis());
            String model = Seats.modelId(prefs);
            if (model.length() > 0) body.put("model", model);
            String permission = Seats.permission(prefs);
            if (permission.length() > 0) body.put("permission", permission);
            String effort = Seats.effort(prefs);
            if (effort.length() > 0) body.put("reasoning", effort);
            if (!images.isEmpty()) {
                JSONArray array = new JSONArray();
                for (Pick.Pending item : images) {
                    JSONObject image = new JSONObject();
                    image.put("mediaType", item.mediaType);
                    image.put("data", item.data);
                    image.put("name", item.name);
                    array.put(image);
                }
                body.put("images", array);
            }
        } catch (Exception ignore) {
        }

        api.post("/v1/sessions", body, new Api.Callback() {
            @Override
            public void onOk(JSONObject result) {
                final String id = result.optString("sessionId", "");
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        setSending(false);
                        if (id.length() == 0) {
                            toast(getString(R.string.mn_no_session_id));
                            restore(text, images);
                            return;
                        }
                        load(false);
                        Intent intent = new Intent(MainActivity.this, ChatActivity.class);
                        intent.putExtra("sessionId", id);
                        intent.putExtra("title", titleFor(text));
                        pushIn(intent);
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        setSending(false);
                        restore(text, images);
                        toast(getString(R.string.mn_send_failed, message));
                    }
                });
            }
        });
    }

    private void restore(String text, List<Pick.Pending> images) {
        if (input.getText().length() == 0 && text.length() > 0) {
            input.setText(text);
            input.setSelection(input.getText().length());
        }
        if (pending.isEmpty() && !images.isEmpty()) {
            pending.addAll(images);
            renderStrip();
        }
    }

    private String titleFor(String text) {
        String line = text == null ? "" : text.trim();
        int breakAt = line.indexOf('\n');
        if (breakAt > 0) line = line.substring(0, breakAt).trim();
        if (line.length() == 0) return getString(R.string.session_untitled);
        return line.length() > 24 ? line.substring(0, 24) : line;
    }

    /** 取一次 /v1/catalog：工作目录、模型前缀、默认权限。 */
    private void ensureCatalog(final Runnable then) {
        api.get("/v1/catalog", new Api.Callback() {
            @Override
            public void onOk(JSONObject body) {
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
                final String dir = cwds.isEmpty() ? "" : cwds.get(0);
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        renderChips();
                        wsCwds.clear();
                        wsNames.clear();
                        wsCwds.addAll(cwds);
                        wsNames.addAll(names);
                        if (!archivedView && wsSelected.length() > 0 && !wsCwds.contains(wsSelected)) {
                            // 电脑端已经删掉这个工作区了，退回「跟随默认」。
                            wsSelected = "";
                            prefs.setWorkspace("", "");
                        }
                        if (wsSelected.length() > 0) cwd = wsSelected;
                        else if (dir.length() > 0) cwd = dir;
                        catalogTried = false;
                        renderHead();
                        if (then != null) then.run();
                    }
                });
            }

            @Override
            public void onError(final String message) {
                ui.post(new Runnable() {
                    @Override
                    public void run() {
                        catalogTried = true;
                        toast(getString(R.string.mn_connect_failed, message));
                    }
                });
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* 抽屉开合 / 生命周期                                                */
    /* ------------------------------------------------------------------ */

    private void openDrawer() {
        drawerOpen = true;
        drawer.setVisibility(View.VISIBLE);
        mask.setVisibility(View.VISIBLE);
        // 从**当前**拖拽位置续到 0（滑一半松手时不吸回 -drawerWidth 再滑，避免一次可见回跳）。
        // 时长/曲线/遮罩目标值全部由 Motion 令牌托管：进场 220ms（Motion.DUR_DRAWER_IN）+ EASE_DECELERATE。
        // 注意：参考侧尚无抽屉时长实测，故时长仍是本项目原值 220ms，本轮只换了曲线与取值来源。
        Motion.drawerIn(drawer, mask, drawer.getTranslationX()).start();
        // 抽屉刚打开：若列表里还有跑着的会话，开始静默追问它的 status（见 syncRunningPoll）。
        syncRunningPoll();
    }

    /** 立刻收起抽屉（不跑动画、不留中间帧）。离屏跳转前用它，避免两条动画抢帧。 */
    private void closeDrawerNow() {
        if (drawer == null || mask == null) return;
        drawerOpen = false;
        ui.removeCallbacks(runningPoll);
        drawer.animate().cancel();
        mask.animate().cancel();
        drawer.setTranslationX(-drawerWidth);
        drawer.setVisibility(View.GONE);
        mask.setAlpha(0f);
        mask.setVisibility(View.GONE);
    }

    private void closeDrawer() {
        if (drawer == null || mask == null) return;
        if (!drawerOpen) {
            drawer.setVisibility(View.GONE);
            mask.setVisibility(View.GONE);
            return;
        }
        drawerOpen = false;
        // 抽屉收起后环都不可见了，轮询一并停（openDrawer 会重新排）。
        ui.removeCallbacks(runningPoll);
        // 退场曲线与时长同样走 Motion（SPEC §6.2：200ms + 强加速退场曲线）；收尾隐藏保持原判定。
        Motion.drawerOut(drawer, mask, -drawerWidth, new Runnable() {
            @Override
            public void run() {
                if (!drawerOpen) {
                    drawer.setVisibility(View.GONE);
                    mask.setVisibility(View.GONE);
                }
            }
        }).start();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onBackPressed() {
        // 归档页是独立页面：返回就是退出这一页。
        if (archivedView) {
            Nav.close(this);
            return;
        }
        if (searchPage != null && searchPage.getVisibility() == View.VISIBLE) {
            closeSearch();
            return;
        }
        if (batchMode) {
            endBatch();
            return;
        }
        if (drawerOpen) {
            closeDrawer();
            return;
        }
        super.onBackPressed();
    }
}
