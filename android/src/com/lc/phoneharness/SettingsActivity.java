package com.lc.phoneharness;

import android.app.Activity;
import android.content.Context;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.CompoundButton;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * 设置页：按 DeepSeek 官方客户端 2.6.1「设置」页逐像素对齐（shots/tpl/tpl-me.png）。
 *
 * 结构：52dp 顶栏（36dp 圆形返回 + 居中标题）+ ScrollView 分组卡片；
 * 分组 = 13sp 灰标题 + 白色 14dp 圆角卡片（左右 12dp 外边距），行高 52dp、图标 22dp、
 * 右侧 14sp 灰值文本 + 16dp chevron，行间 1px 分隔线（左右各 16dp 内缩）。
 * 「字体大小」在同一 Activity 内整页替换（顶栏返回先回设置页），底部固定 20dp 上圆角 sheet。
 *
 * 颜色一律取自 Theme；文案一律取自 R.string（「未连接」「小/偏小/大/特大」等无资源可用的
 * 短语才就地硬编码，因为本工程不允许新增资源文件）。
 */
public class SettingsActivity extends Activity {

    /** attach 阶段定下的语言：onResume 用它判断界面是否需要重建（与主题的 darkAtBuild 同一套做法）。 */
    private String langAtBuild;

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Langs.wrap(base));
        langAtBuild = Langs.current(base);
    }

    /** 当前版本号：从安装包真值读（PackageManager），编译期常量只当兜底。 */
    private String VERSION = App.VERSION_NAME;
    /** 本机安装包的 versionCode：跟宿主的 /apk/meta 比大小。 */
    private int versionCode;
    /** 「检查更新」行右侧的值：检查完就地刷新。 */
    private TextView updateValueView;
    /** 正在检查时挡住重复点击。 */
    private boolean checkingUpdate;
    /** 进设置页自动静默查一次，只查一次。 */
    private boolean autoChecked;

    /** 字号滑块的取值区间：1.0（标准）落在正中，左右各留 0.20 档。 */
    private static final float SCALE_MIN = 0.80f;
    private static final float SCALE_MAX = 1.20f;

    private Prefs prefs;
    private Api api;
    private Theme t;
    private FrameLayout root;
    /** true = 当前显示「字体大小」页，返回键先回设置页。 */
    private boolean fontPage;
    /** true = 当前显示「用户主机的 Harness」页，返回键先回设置页（与字体页同一套整页替换）。 */
    private boolean harnessPage;
    /** 设置页「用户主机的 Harness」行右侧的值：主机状态刷新后要就地更新。 */
    private TextView harnessValueView;
    /** 「应用 · 模型」行右侧的值：选完模型回来要就地更新。 */
    private TextView modelValueView;
    /** 「账户 · 在线主机」行右侧的值：切完主机回来要就地更新。 */
    private TextView hostValueView;
    /** 建界面时的明暗，onResume 用来比对：主题是建界面时算出来的，明暗一变就整体重建。 */
    private boolean darkAtBuild;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = new Prefs(this);
        api = new Api(prefs);
        t = Theme.of(this);
        darkAtBuild = t.dark;
        VERSION = App.versionName(this);
        versionCode = App.versionCode(this);

        // 官方设置页是「浅灰底 + 白卡」：Theme 浅色下 bg 与 surface 同为 #FFFFFF，
        // 所以页面底取次级底色 surfaceAlt（#F3F4F6 ≈ 官方 #F8F8F8），深色下取 bg（#0F0F0F）。
        // 窗口底面先铺成页面底色：主题里的 windowBackground 是纯白，而设置页底是 #F3F4F6，
        // 冷启动那一两帧会先露白再变色，看起来就是「闪白」。底面一致后首帧即终态。
        getWindow().setBackgroundDrawable(new ColorDrawable(pageBg()));
        getWindow().setStatusBarColor(pageBg());
        getWindow().setNavigationBarColor(pageBg());
        getWindow().getDecorView().setSystemUiVisibility(
                t.dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        root = new FrameLayout(this);
        root.setBackgroundColor(pageBg());
        setContentView(root);

        showSettings();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 语言在 attach 阶段定死：设置页改过语言后，回到本页要整体重建。
        if (Langs.changed(this, langAtBuild)) {
            recreate();
            return;
        }
        // 外观页可能刚改过主题：明暗一变就整体重建（重建后本方法这一轮不再往下走）。
        // 注：字体大小的 recreate 在字体页自己的开关回调里（改字号是全 App 重排，那里不重复加）。
        if (t != null && Theme.of(this).dark != darkAtBuild) {
            recreate();
            return;
        }
        // 从「在线主机」页切完主机回来：行右侧的当前主机名要跟着变。
        if (hostValueView != null) hostValueView.setText(hostsValue());
        // 进设置页静默查一次：有新版本时「检查更新」行右侧直接显示出来，不打扰。
        if (!autoChecked && updateValueView != null && prefs.token().length() > 0) {
            autoChecked = true;
            checkUpdate(true);
        }
    }

    @Override
    public void onBackPressed() {
        if (fontPage || harnessPage) {
            showSettings();
            return;
        }
        finishWithPop();
    }

    /** 退出本页：让本页向右淡出、下面的首页原地不动（与进入时的方向对称）。 */
    private void finishWithPop() {
        Nav.close(this);
    }

    /** 页面底色（含状态栏）。 */
    private int pageBg() {
        return t.dark ? t.bg : t.surfaceAlt;
    }

    /** 圆形返回按钮的底：官方浅色 #EFEFEF（比页面底深一档），深色 #1E1E1E。 */
    private int backChip() {
        return t.dark ? t.surfaceAlt : Theme.alpha(t.text, 0.06f);
    }

    /* ================================================================== */
    /* 顶栏                                                               */
    /* ================================================================== */

    private View topBar(final String title, final boolean backToSettings) {
        FrameLayout bar = new FrameLayout(this);
        bar.setBackgroundColor(pageBg());
        bar.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(52)));

        FrameLayout back = new FrameLayout(this);
        back.setBackground(t.rippleOn(backChip(), 999f));
        back.setClickable(true);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (backToSettings) showSettings();
                else finishWithPop();
            }
        });

        ImageView arrow = new ImageView(this);
        arrow.setImageResource(R.drawable.ic_back);
        arrow.setColorFilter(t.text);
        back.addView(arrow, new FrameLayout.LayoutParams(t.dp(20), t.dp(20), Gravity.CENTER));

        FrameLayout.LayoutParams backLp = new FrameLayout.LayoutParams(t.dp(36), t.dp(36));
        backLp.gravity = Gravity.CENTER_VERTICAL | Gravity.START;
        backLp.leftMargin = t.dp(8);
        bar.addView(back, backLp);

        TextView label = t.strong(title, 17f, t.text);
        label.setGravity(Gravity.CENTER);
        label.setSingleLine(true);
        bar.addView(label, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        return bar;
    }

    /* ================================================================== */
    /* 设置页                                                             */
    /* ================================================================== */

    private void showSettings() {
        fontPage = false;
        harnessPage = false;
        root.removeAllViews();

        LinearLayout page = t.column();
        page.setBackgroundColor(pageBg());
        root.addView(page, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        page.addView(topBar(getString(R.string.profile_title), false));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        LinearLayout body = t.column();
        body.setPadding(0, t.dp(4), 0, t.dp(32));
        scroll.addView(body, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        page.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        /* 品牌位：logo + 应用名 + 版本（关于页的品牌展示） */
        LinearLayout brandCard = group(body, null);
        LinearLayout brandRow = t.row();
        brandRow.setGravity(Gravity.CENTER_VERTICAL);
        brandRow.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));

        ImageView brandMark = new ImageView(this);
        brandMark.setImageResource(t.brandLogo());
        brandMark.setScaleType(ImageView.ScaleType.FIT_CENTER);
        brandRow.addView(brandMark, new LinearLayout.LayoutParams(t.dp(40), t.dp(40)));

        LinearLayout brandText = t.column();
        TextView brandName = t.strong(App.NAME, 16f, t.text);
        brandText.addView(brandName);
        TextView brandVersion = t.text("v" + VERSION, 12.5f, t.muted);
        Theme.margin(brandVersion, 0, t.dp(3), 0, 0);
        brandText.addView(brandVersion);

        LinearLayout.LayoutParams brandTextLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        brandTextLp.leftMargin = t.dp(12);
        brandRow.addView(brandText, brandTextLp);
        brandCard.addView(brandRow);


        /* 账户 */
        LinearLayout account = group(body, getString(R.string.profile_info_section_header));
        row(account, R.drawable.ic_person, getString(R.string.account_management),
                accountValue(), true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        push(new Intent(SettingsActivity.this, PairActivity.class));
                    }
                });
        // 原「数据管理」→「在线主机」：一台手机管多台电脑上的 harness，
        // 列表里看在线状态，点一台就切到它的工作台/归纳箱。
        hostValueView = row(account, R.drawable.ic_host, getString(R.string.hosts_title),
                hostsValue(), true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        push(new Intent(SettingsActivity.this, HostsActivity.class));
                    }
                });

        /* 内容（工作区 / 归档箱）：按用户要求排在账户卡片下面 */
        LinearLayout connection = group(body, getString(R.string.settings_connection_header));
        row(connection, R.drawable.ic_folder24, getString(R.string.st_workspace_row), workspaceValue(), true,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        workspacePicker();
                    }
                });
        row(connection, R.drawable.ic_archive, getString(R.string.settings_archive_row),
                null, true, archiveClick());

        /* 应用 */
        LinearLayout app = group(body, getString(R.string.app_section_title));
        // 模型：右侧显示当前模型短名，点开就是 composer 上那枚模型 chip 的同一个面板。
        modelValueView = row(app, R.drawable.ic_settings, getString(R.string.seat_model),
                Seats.compactTitle(this, prefs), true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        Seats.showModelPanel(SettingsActivity.this, t, prefs, view, modelRowUpdater());
                    }
                });
        // 语言：与「外观」同一套选择器（官方是弹层单选 + 确认），右侧值用各语言自己的写法。
        row(app, R.drawable.ic_globe16, getString(R.string.app_language),
                Langs.label(this), true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        languageDialog();
                    }
                });
        row(app, R.drawable.ic_sun, getString(R.string.app_color_scheme),
                themeValue(), true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        appearanceDialog();
                    }
                });
        row(app, R.drawable.ic_size, getString(R.string.font_size),
                null, true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        showFontPage();
                    }
                });
        row(app, R.drawable.ic_enhance, getString(R.string.personalization),
                null, true, toastClick(getString(R.string.st_personalization_toast)));

        /* 语音 */
        LinearLayout voice = group(body, getString(R.string.account_audio_input_language_header));
        row(voice, R.drawable.ic_volume, getString(R.string.voice_switch_bottom_sheet_title),
                null, true, toastClick(getString(R.string.st_voice_toast)));

        /* 关于 */
        LinearLayout about = group(body, getString(R.string.profile_about_section_header));
        updateValueView = row(about, R.drawable.ic_info, getString(R.string.profile_check_for_updates),
                VERSION, true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        checkUpdate(false);
                    }
                });
        row(about, R.drawable.ic_doc, getString(R.string.profile_service_agreement),
                null, true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        infoCard(getString(R.string.profile_service_agreement), serviceText());
                    }
                });

        /* 官方这里是两张独立卡片（截图中间有明显间距），不是同一张卡片的两行。 */
        LinearLayout helpCard = group(body, null);
        row(helpCard, R.drawable.ic_help, getString(R.string.profile_help_and_feedback),
                null, true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        infoCard(getString(R.string.profile_help_and_feedback), helpText());
                    }
                });

        LinearLayout logoutCard = group(body, null);
        row(logoutCard, R.drawable.ic_logout, getString(R.string.profile_logout),
                null, true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        confirmLogout();
                    }
                });
    }

    /** 分组标题（13sp 灰字）：与卡片内图标左对齐（12dp 外边距 + 16dp 内边距）。 */
    private LinearLayout group(LinearLayout parent, String header) {
        if (header == null) {
            parent.addView(spacer(t.dp(20)));
        } else {
            TextView title = t.text(header, 13f, t.muted);
            title.setPadding(t.dp(28), t.dp(20), t.dp(28), t.dp(8));
            parent.addView(title, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 14f));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.leftMargin = t.dp(12);
        cardLp.rightMargin = t.dp(12);
        parent.addView(card, cardLp);
        return card;
    }

    private View spacer(int height) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, height));
        return view;
    }

    /**
     * 一行设置项：52dp 高、左右 16dp 内边距、22dp 图标、15sp 标签、可选 14sp 灰值、16dp chevron。
     * 除第一行外自动补一条 1px 分隔线（左右各缩进 16dp）。
     */
    /** 「在线主机」行右侧：当前主机名 + 一共几台。 */
    private String hostsValue() {
        List<Hosts.Entry> list = Hosts.load(prefs);
        if (list.isEmpty()) return getString(R.string.st_hosts_value_none);
        Hosts.Entry active = Hosts.active(prefs);
        String name = active == null ? list.get(0).address : Hosts.title(active);
        return list.size() > 1 ? getString(R.string.st_hosts_value_multi, name, list.size()) : name;
    }

    private TextView row(LinearLayout card, int iconRes, String label, String value,
                         boolean chevron, View.OnClickListener click) {
        if (card.getChildCount() > 0) {
            View line = t.hairline();
            LinearLayout.LayoutParams lineLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, t.dp(0.7f)));
            lineLp.leftMargin = t.dp(16);
            lineLp.rightMargin = t.dp(16);
            card.addView(line, lineLp);
        }

        LinearLayout cell = t.row();
        cell.setBackground(t.ripple(14));
        cell.setPadding(t.dp(16), 0, t.dp(16), 0);
        cell.setClickable(true);
        cell.setOnClickListener(click);
        card.addView(cell, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(52)));

        cell.addView(t.icon(iconRes, t.text, 22));

        TextView name = t.text(label, 15f, t.text);
        LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        nameLp.leftMargin = t.dp(12);
        cell.addView(name, nameLp);

        TextView side = null;
        if (value != null && value.length() > 0) {
            side = t.text(value, 14f, t.muted);
            side.setGravity(Gravity.END);
            side.setSingleLine(true);
            side.setEllipsize(TextUtils.TruncateAt.END);
            side.setMaxWidth((int) (getResources().getDisplayMetrics().widthPixels * 0.46f));
            cell.addView(side, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        if (chevron) {
            ImageView arrow = t.icon(R.drawable.ic_chevron_right, t.muted2, 16);
            LinearLayout.LayoutParams arrowLp = new LinearLayout.LayoutParams(t.dp(16), t.dp(16));
            arrowLp.leftMargin = t.dp(6);
            cell.addView(arrow, arrowLp);
        }
        return side;
    }

    /** 模型面板回调：选完模型回来就地刷新右侧的短名。 */
    private Runnable modelRowUpdater() {
        return new Runnable() {
            @Override
            public void run() {
                if (modelValueView == null) return;
                modelValueView.setText(Seats.compactTitle(SettingsActivity.this, prefs));
            }
        };
    }

    /** 设置页「工作区」右侧的值：跟电脑端同一个名字，没选过就显示「跟随电脑端」。 */
    private String workspaceValue() {
        String name = prefs.workspaceName();
        String dir = prefs.workspaceCwd();
        if (name != null && name.length() > 0) {
            // 存过整条路径的历史值：只显示最后一段，跟电脑端工作区名一致。
            if (name.indexOf('\\') >= 0 || name.indexOf('/') >= 0) return shortName(name);
            return name;
        }
        if (dir != null && dir.length() > 0) return shortName(dir);
        return getString(R.string.st_workspace_follow);
    }

    private String shortName(String dir) {
        String value = dir == null ? "" : dir.trim();
        while (value.length() > 1 && (value.endsWith("\\") || value.endsWith("/"))) {
            value = value.substring(0, value.length() - 1);
        }
        int cut = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
        if (cut >= 0 && cut + 1 < value.length()) return value.substring(cut + 1);
        return value;
    }

    /** 工作区选择器：直接读电脑端的 /v1/catalog，跟电脑端 harness 侧栏同一份列表。 */
    private void workspacePicker() {
        api.get("/v1/catalog", new Api.Callback() {
            @Override
            public void onOk(org.json.JSONObject body) {
                final List<String> cwds = new ArrayList<String>();
                final List<String> names = new ArrayList<String>();
                cwds.add("");
                names.add(getString(R.string.st_workspace_follow));
                org.json.JSONArray workspaces = body.optJSONArray("workspaces");
                if (workspaces != null) {
                    for (int index = 0; index < workspaces.length(); index++) {
                        org.json.JSONObject entry = workspaces.optJSONObject(index);
                        if (entry == null) continue;
                        String dir = entry.optString("cwd", "");
                        if (dir.length() == 0) continue;
                        String title = entry.optString("title", dir);
                        if (title.length() == 0 || title.equalsIgnoreCase(dir)) title = shortName(dir);
                        cwds.add(dir);
                        names.add(title);
                    }
                }
                final String[] labels = new String[names.size()];
                for (int index = 0; index < names.size(); index++) labels[index] = names.get(index);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (isFinishing()) return;
                        showWorkspaceDialog(labels, cwds, names);
                    }
                });
            }

            @Override
            public void onError(final String message) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        toast(getString(R.string.st_workspace_unreachable, message));
                    }
                });
            }
        });
    }

    /** 工作区选择弹窗：自带深色/浅色适配（系统 AlertDialog 在深色主题下会是白底黑字）。 */
    private void showWorkspaceDialog(final String[] labels, final List<String> cwds,
                                     final List<String> names) {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(0, t.dp(6), 0, t.dp(8));

        TextView head = t.strong(getString(R.string.st_workspace_dialog_title), 16f, t.text);
        head.setGravity(Gravity.CENTER);
        head.setPadding(0, t.dp(16), 0, t.dp(12));
        card.addView(head, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        card.addView(t.hairline());

        LinearLayout listBox = t.column();
        for (int index = 0; index < labels.length; index++) {
            final int slot = index;
            boolean current = cwds.get(index).equalsIgnoreCase(prefs.workspaceCwd());
            TextView item = t.text(labels[index], 15f, current ? t.accent : t.text);
            item.setSingleLine(true);
            item.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            item.setGravity(Gravity.CENTER_VERTICAL);
            item.setPadding(t.dp(18), t.dp(13), t.dp(18), t.dp(13));
            item.setBackground(t.ripple(8f));
            item.setClickable(true);
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    dialog.dismiss();
                    // 存储口径与电脑端一致：跟随电脑端存空串（语言无关），否则切到英文界面会残留中文。
                    prefs.setWorkspace(cwds.get(slot), cwds.get(slot).length() == 0 ? "" : names.get(slot));
                    showSettings();
                    toast(getString(R.string.st_workspace_switched, labels[slot]));
                }
            });
            listBox.addView(item, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.addView(listBox);
        int maxList = (int) (getResources().getDisplayMetrics().heightPixels * 0.58f);
        card.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, Math.min(t.dp(46) * labels.length, maxList)));

        dialog.setContentView(card);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams();
            lp.copyFrom(window.getAttributes());
            lp.width = t.dp(300);
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            window.setAttributes(lp);
        }
        dialog.show();
        Motion.panelIn(card, this);
    }

    private String connectionValue() {
        String address = prefs.address().trim();
        return address.length() == 0 ? getString(R.string.st_connection_none) : address;
    }

    private String themeValue() {
        String mode = prefs.theme();
        if ("day".equals(mode)) return getString(R.string.app_color_scheme_light);
        if ("dark".equals(mode)) return getString(R.string.app_color_scheme_dark);
        return getString(R.string.app_color_scheme_system);
    }

    private View.OnClickListener archiveClick() {
        return new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                push(new Intent(SettingsActivity.this, MainActivity.class).putExtra("archive", true));
            }
        };
    }

    /** 页内跳下一屏：统一用同一条右进转场，别跟系统默认的缩放入场混着走。 */
    private void push(Intent intent) {
        Nav.open(this, intent);
    }

    private View.OnClickListener toastClick(final String message) {
        return new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                toast(message);
            }
        };
    }

    /* ================================================================== */
    /* 检查更新：拿宿主 /apk/meta 与本机安装包对比（不下载整包）            */
    /* ================================================================== */

    /** silent=true 只把结果写进行右侧（进设置页自动跑一次），不弹窗也不报错。 */
    private void checkUpdate(final boolean silent) {
        if (checkingUpdate) return;
        if (prefs.base().length() == 0) {
            if (!silent) toast(getString(R.string.st_update_need_host));
            return;
        }
        checkingUpdate = true;
        if (!silent) setUpdateValue(getString(R.string.st_update_checking));
        api.get("/apk/meta", new Api.Callback() {
            @Override
            public void onOk(org.json.JSONObject body) {
                org.json.JSONObject apk = body.optJSONObject("apk");
                final int remoteCode = apk == null ? 0 : apk.optInt("versionCode", 0);
                final String remoteName = apk == null ? "" : apk.optString("versionName", "");
                final String remoteMd5 = apk == null ? "" : apk.optString("md5", "");
                final String localMd5 = md5(packageCodePath());
                // 版本号变大 = 有新版本；版本号没变但包内容变了（重新构建没提版本号）也算。
                final boolean newer = remoteCode > versionCode;
                final boolean rebuilt = remoteCode == versionCode && remoteCode > 0
                        && remoteMd5.length() > 0 && !remoteMd5.equalsIgnoreCase(localMd5);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        checkingUpdate = false;
                        if (newer || rebuilt) {
                            setUpdateValue(getString(R.string.st_update_value, remoteName));
                            if (!silent) {
                                showUpdate(remoteName, newer
                                        ? getString(R.string.st_update_remote_newer, VERSION, remoteName)
                                        : getString(R.string.st_update_remote_rebuilt, VERSION));
                            }
                        } else {
                            setUpdateValue(VERSION);
                            if (!silent) toast(getString(R.string.st_update_latest, VERSION));
                        }
                    }
                });
            }

            @Override
            public void onError(final String message) {
                checkingUpdate = false;
                setUpdateValue(VERSION);
                if (!silent) toast(getString(R.string.st_update_failed, message));
            }
        });
    }

    private void setUpdateValue(final String text) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (updateValueView != null) updateValueView.setText(text);
            }
        });
    }

    /** 有新版本：给一个直达电脑 /apk 的下载入口，装不装由用户决定。 */
    private void showUpdate(String remoteName, String message) {
        final String url = prefs.base() + "/apk";
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.st_update_dialog_title, remoteName))
                .setMessage(getString(R.string.st_update_dialog_body, message, url))
                .setPositiveButton(getString(R.string.st_update_download),
                        new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface dialog, int which) {
                        try {
                            startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,
                                    android.net.Uri.parse(url)));
                        } catch (Exception error) {
                            toast(getString(R.string.st_update_no_browser, url));
                        }
                    }
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    /** 本机安装包路径（算 md5 用）。 */
    private String packageCodePath() {
        try {
            return getPackageCodePath();
        } catch (Exception error) {
            return "";
        }
    }

    /** 文件 md5 小写 hex：版本号相同但重新构建过时靠它区分。 */
    private static String md5(String path) {
        if (path == null || path.length() == 0) return "";
        java.io.InputStream in = null;
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("MD5");
            in = new java.io.FileInputStream(path);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) digest.update(buffer, 0, read);
            StringBuilder out = new StringBuilder();
            for (byte b : digest.digest()) {
                String hex = Integer.toHexString(b & 0xff);
                if (hex.length() == 1) out.append('0');
                out.append(hex);
            }
            return out.toString();
        } catch (Exception error) {
            return "";
        } finally {
            if (in != null) {
                try { in.close(); } catch (Exception ignore) { }
            }
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    /** 账户行右侧的值：电脑端登录的账号名（没登录/拿不到就不显示）。 */
    private String accountValue() {
        String name = Me.displayName(prefs);
        return App.NAME.equals(name) ? null : name;
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.profile_logout))
                .setMessage(getString(R.string.st_logout_confirm))
                .setNegativeButton(getString(R.string.cancel), null)
                .setPositiveButton(getString(R.string.profile_logout),
                        new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                prefs.clearToken();
                                // 换一台电脑/换账号时别把上一个人的头像和昵称留在抽屉里。
                                prefs.clearUser();
                                Me.clear(SettingsActivity.this);
                                Intent intent = new Intent(SettingsActivity.this, PairActivity.class);
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                        | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                                Nav.replace(SettingsActivity.this, intent);
                            }
                        })
                .show();
    }

    /* ================================================================== */
    /* 外观对话框                                                          */
    /* ================================================================== */

    private void appearanceDialog() {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        final String[] keys = {"auto", "day", "dark"};
        final String[] labels = {
                getString(R.string.app_color_scheme_system),
                getString(R.string.app_color_scheme_light),
                getString(R.string.app_color_scheme_dark)
        };
        final int[] picked = {0};
        for (int i = 0; i < keys.length; i++) {
            if (keys[i].equals(prefs.theme())) picked[0] = i;
        }

        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));

        TextView title = t.strong(getString(R.string.app_color_scheme), 16f, t.text);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, t.dp(18), 0, t.dp(18));
        card.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        card.addView(t.hairline());

        final List<View> dots = new ArrayList<View>();
        for (int i = 0; i < labels.length; i++) {
            final int index = i;

            LinearLayout line = t.row();
            line.setBackground(t.ripple(14));
            line.setPadding(t.dp(16), 0, t.dp(16), 0);
            line.setClickable(true);

            TextView text = t.text(labels[i], 15f, t.text);
            line.addView(text, new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            View dot = new View(this);
            dot.setBackground(radioDrawable(i == picked[0]));
            line.addView(dot, new LinearLayout.LayoutParams(t.dp(22), t.dp(22)));

            line.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    picked[0] = index;
                    for (int k = 0; k < dots.size(); k++) {
                        dots.get(k).setBackground(radioDrawable(k == picked[0]));
                    }
                }
            });

            card.addView(line, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(48)));
            dots.add(dot);
        }

        card.addView(t.hairline());

        TextView confirm = t.text(getString(R.string.confirm), 16f, t.accent);
        confirm.setGravity(Gravity.CENTER);
        confirm.setBackground(t.ripple(16));
        confirm.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                prefs.setTheme(keys[picked[0]]);
                dialog.dismiss();
                recreate();
            }
        });
        card.addView(confirm, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(48)));

        // Dialog 的内容根会按自身 LayoutParams 生成，直接塞 LinearLayout 会被缩成 wrap_content，
        // 所以套一层 FrameLayout 把卡片撑满窗口宽度（官方弹窗宽度约 300dp）。
        FrameLayout wrap = new FrameLayout(this);
        wrap.addView(card, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        dialog.setContentView(wrap);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.width = t.dp(300);
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            lp.gravity = Gravity.CENTER;
            lp.dimAmount = 0.35f;
            window.setAttributes(lp);
        }
        dialog.show();
        Motion.panelIn(card, this);
        if (window != null) {
            window.setLayout(t.dp(300), WindowManager.LayoutParams.WRAP_CONTENT);
        }
    }

    /**
     * 语言选择：与「外观」同一套弹层（单选 + 确认 + panelIn）。
     * 两个选项用各自语言的原生写法，不随当前语言翻译（系统语言选择器的通行做法）。
     */
    private void languageDialog() {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        final String[] keys = {Langs.ZH, Langs.EN};
        final String[] labels = {Langs.ZH_LABEL, Langs.EN_LABEL};
        final int[] picked = {0};
        for (int i = 0; i < keys.length; i++) {
            if (keys[i].equals(Langs.current(this))) picked[0] = i;
        }

        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));

        TextView title = t.strong(getString(R.string.app_language), 16f, t.text);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, t.dp(18), 0, t.dp(18));
        card.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        card.addView(t.hairline());

        final List<View> dots = new ArrayList<View>();
        for (int i = 0; i < labels.length; i++) {
            final int index = i;

            LinearLayout line = t.row();
            line.setBackground(t.ripple(14));
            line.setPadding(t.dp(16), 0, t.dp(16), 0);
            line.setClickable(true);

            TextView text = t.text(labels[i], 15f, t.text);
            line.addView(text, new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            View dot = new View(this);
            dot.setBackground(radioDrawable(i == picked[0]));
            line.addView(dot, new LinearLayout.LayoutParams(t.dp(22), t.dp(22)));

            line.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    picked[0] = index;
                    for (int k = 0; k < dots.size(); k++) {
                        dots.get(k).setBackground(radioDrawable(k == picked[0]));
                    }
                }
            });

            card.addView(line, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(48)));
            dots.add(dot);
        }

        card.addView(t.hairline());

        TextView confirm = t.text(getString(R.string.confirm), 16f, t.accent);
        confirm.setGravity(Gravity.CENTER);
        confirm.setBackground(t.ripple(16));
        confirm.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                boolean same = keys[picked[0]].equals(Langs.current(SettingsActivity.this));
                Langs.set(SettingsActivity.this, keys[picked[0]]);
                dialog.dismiss();
                // 只有真的换了语言才整体重建（与外观弹层同一套收尾）。
                if (!same) recreate();
            }
        });
        card.addView(confirm, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(48)));

        FrameLayout wrap = new FrameLayout(this);
        wrap.addView(card, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        dialog.setContentView(wrap);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.width = t.dp(300);
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            lp.gravity = Gravity.CENTER;
            lp.dimAmount = 0.35f;
            window.setAttributes(lp);
        }
        dialog.show();
        Motion.panelIn(card, this);
        if (window != null) {
            window.setLayout(t.dp(300), WindowManager.LayoutParams.WRAP_CONTENT);
        }
    }

    /** 22dp 单选圆：选中 = 2dp 品牌色圆环 + 10dp 实心点；未选中 = 1px 灰色圆环。 */
    private Drawable radioDrawable(boolean on) {
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.TRANSPARENT);
        if (on) {
            ring.setStroke(Math.max(1, t.dp(2)), t.accent);
            GradientDrawable dot = new GradientDrawable();
            dot.setShape(GradientDrawable.OVAL);
            dot.setColor(t.accent);
            LayerDrawable layers = new LayerDrawable(new Drawable[]{ring, dot});
            int inset = t.dp(6);
            layers.setLayerInset(1, inset, inset, inset, inset);
            return layers;
        }
        ring.setStroke(Math.max(1, t.dp(1)), Theme.alpha(t.text, 0.22f));
        return ring;
    }

    /* ================================================================== */
    /* 服务协议 / 帮助与反馈                                               */
    /* ================================================================== */

    /** 服务协议正文：长段落整体搬进资源，中文原文逐字保留（含 \n\n 分段）。 */
    private String serviceText() {
        return getString(R.string.st_service_text);
    }

    /** 帮助与反馈正文：同样是整段资源。 */
    private String helpText() {
        return getString(R.string.st_help_text);
    }

    private void infoCard(String title, String body) {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        int width = t.dp(320);
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));

        TextView head = t.strong(title, 16f, t.text);
        head.setGravity(Gravity.CENTER);
        head.setPadding(t.dp(16), t.dp(18), t.dp(16), t.dp(16));
        card.addView(head, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        card.addView(t.hairline());

        TextView text = t.text(body, 13f, t.muted);
        text.setLineSpacing(t.dp(6), 1f);
        text.setPadding(t.dp(18), t.dp(16), t.dp(18), t.dp(16));

        int inner = width - t.dp(36);
        text.measure(View.MeasureSpec.makeMeasureSpec(inner, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        int maxBody = (int) (getResources().getDisplayMetrics().heightPixels * 0.55f);
        int bodyHeight = Math.max(t.dp(80), Math.min(text.getMeasuredHeight(), maxBody));

        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.addView(text, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        card.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, bodyHeight));

        card.addView(t.hairline());

        TextView confirm = t.text(getString(R.string.confirm), 16f, t.accent);
        confirm.setGravity(Gravity.CENTER);
        confirm.setBackground(t.ripple(16));
        confirm.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });
        card.addView(confirm, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(48)));

        FrameLayout wrap = new FrameLayout(this);
        wrap.addView(card, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        dialog.setContentView(wrap);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.width = width;
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            lp.gravity = Gravity.CENTER;
            lp.dimAmount = 0.35f;
            window.setAttributes(lp);
        }
        dialog.show();
        Motion.panelIn(card, this);
        if (window != null) {
            window.setLayout(width, WindowManager.LayoutParams.WRAP_CONTENT);
        }
    }

    /* ================================================================== */
    /* 字体大小页                                                          */
    /* ================================================================== */

    /* ================================================================== */
    /* 用户主机的 Harness（契约 §3.3）                                      */
    /* ================================================================== */

    /** 设置页那一行右侧的值：优先主机状态，退到 Prefs 快照，再退到工作区。 */
    private String harnessRowValue() {
        Harness.State state = Harness.state();
        String preset = state != null ? state.presetTitle(state.agentPreset) : prefs.harnessPresetTitle();
        if (TextUtils.isEmpty(preset)) preset = prefs.harnessPresetTitle();
        if (!TextUtils.isEmpty(preset)) return preset;
        String workspace = state != null ? state.workspaceTitle() : prefs.harnessWorkspaceTitle();
        if (TextUtils.isEmpty(workspace)) workspace = prefs.harnessWorkspaceTitle();
        if (!TextUtils.isEmpty(workspace)) return workspace;
        return null;
    }

    /** 进入主机的 Harness 页：首帧先读缓存渲染，随后静默拉一次 /v1/harness。 */
    private void showHarnessPage() {
        showHarnessPage(true);
    }

    /**
     * 主机的 Harness 页：与「字体大小」页一样整页替换。
     * refresh=false 只重画（刷新回来时用，避免再触发一轮请求）。
     */
    private void showHarnessPage(boolean refresh) {
        harnessPage = true;
        root.removeAllViews();

        LinearLayout page = t.column();
        page.setBackgroundColor(pageBg());
        root.addView(page, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        page.addView(topBar(getString(R.string.harness_settings_row), true));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        LinearLayout body = t.column();
        body.setPadding(0, t.dp(4), 0, t.dp(32));
        scroll.addView(body, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        page.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        Harness.State state = Harness.state();
        // 主机明确说不接受写入：顶部一条警告，四条也只读不可点。
        final boolean writable = state == null || state.writeConfig;
        if (state != null && !state.writeConfig) {
            LinearLayout warnCard = group(body, null);
            LinearLayout warnCell = t.row();
            warnCell.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
            warnCell.addView(t.icon(R.drawable.ic_info, t.warn, 20));
            TextView warnText = t.text(getString(R.string.harness_readonly_warning), 13f, t.warn);
            warnText.setLineSpacing(t.dp(4), 1f);
            LinearLayout.LayoutParams warnLp = new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            warnLp.leftMargin = t.dp(12);
            warnCell.addView(warnText, warnLp);
            warnCard.addView(warnCell, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        /* 四条当前值：点开就是 composer 上那几枚 chip 的同一个面板。 */
        LinearLayout card = group(body, null);
        harnessRow(card, Harness.workspaceIcon(), getString(R.string.harness_workspace_panel_title),
                workspaceTitle(state), workspaceCwd(state), writable, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        Seats.showWorkspacePanel(SettingsActivity.this, t, prefs, view, harnessReload());
                    }
                });
        harnessRow(card, Harness.presetIcon(), getString(R.string.harness_preset_panel_title),
                presetTitle(state), presetHint(state), writable, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        Seats.showPresetPanel(SettingsActivity.this, t, prefs, view, harnessReload());
                    }
                });
        harnessRow(card, R.drawable.ic_data, getString(R.string.seat_model),
                modelText(state), null, writable, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        Seats.showModelMenu(SettingsActivity.this, t, prefs, view, harnessReload());
                    }
                });
        harnessRow(card, Seats.permIcon(permission(state)),
                getString(R.string.new_session_permission_label),
                Seats.permLabel(this, permission(state)), null, writable, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        Seats.showPermissionMenu(SettingsActivity.this, t, prefs, view, harnessReload());
                    }
                });

        /* 工具卡：刷新 + 底部的主机地址 / capabilities 摘要。 */
        LinearLayout tools = group(body, null);
        row(tools, R.drawable.ic_refresh, getString(R.string.harness_refresh), null, false,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        Harness.refresh(SettingsActivity.this, prefs, harnessReload());
                    }
                });

        LinearLayout info = group(body, null);
        LinearLayout infoCell = t.column();
        infoCell.setPadding(t.dp(16), t.dp(13), t.dp(16), t.dp(13));
        infoCell.addView(t.text(getString(R.string.harness_host_label) + " " + prefs.base(), 13f, t.text));
        TextView caps = t.text(capabilityText(state), 12f, t.muted2);
        caps.setLineSpacing(t.dp(4), 1f);
        Theme.margin(caps, 0, t.dp(6), 0, 0);
        infoCell.addView(caps);
        info.addView(infoCell, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        if (refresh) Harness.refresh(this, prefs, harnessReload());
    }

    /** 面板选完回来：重画这一页，并顺手更新设置页那一行。 */
    private Runnable harnessReload() {
        return new Runnable() {
            @Override
            public void run() {
                if (harnessPage) showHarnessPage(false);
                if (harnessValueView != null) harnessValueView.setText(harnessRowValue());
            }
        };
    }

    /** 只读值行：与设置页的行同款，另支持副标题、可整体置灰不可点。 */
    private TextView harnessRow(LinearLayout card, int iconRes, String label, String value,
                                String subtitle, boolean enabled, View.OnClickListener click) {
        if (card.getChildCount() > 0) {
            View line = t.hairline();
            LinearLayout.LayoutParams lineLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, t.dp(0.7f)));
            lineLp.leftMargin = t.dp(16);
            lineLp.rightMargin = t.dp(16);
            card.addView(line, lineLp);
        }

        LinearLayout cell = t.row();
        cell.setBackground(enabled ? t.ripple(14) : null);
        cell.setPadding(t.dp(16), 0, t.dp(16), 0);
        cell.setClickable(enabled);
        if (enabled) cell.setOnClickListener(click);
        card.addView(cell, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, subtitle == null ? t.dp(52) : t.dp(58)));

        cell.addView(t.icon(iconRes, enabled ? t.text : t.muted2, 22));

        LinearLayout texts = t.column();
        LinearLayout.LayoutParams textsLp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        textsLp.leftMargin = t.dp(12);
        texts.addView(t.text(label, 15f, enabled ? t.text : t.muted2));
        if (subtitle != null && subtitle.length() > 0) {
            TextView sub = t.text(subtitle, 12f, t.muted2);
            sub.setSingleLine(true);
            sub.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            Theme.margin(sub, 0, t.dp(3), 0, 0);
            texts.addView(sub);
        }
        cell.addView(texts, textsLp);

        TextView side = null;
        if (value != null && value.length() > 0) {
            side = t.text(value, 14f, enabled ? t.muted : t.muted2);
            side.setGravity(Gravity.END);
            side.setSingleLine(true);
            side.setEllipsize(TextUtils.TruncateAt.END);
            side.setMaxWidth((int) (getResources().getDisplayMetrics().widthPixels * 0.46f));
            cell.addView(side, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        if (enabled) {
            ImageView arrow = t.icon(R.drawable.ic_chevron_right, t.muted2, 16);
            LinearLayout.LayoutParams arrowLp = new LinearLayout.LayoutParams(t.dp(16), t.dp(16));
            arrowLp.leftMargin = t.dp(6);
            cell.addView(arrow, arrowLp);
        }
        return side;
    }

    /** 主机当前工作区名（拿不到就退回手机上的快照）。 */
    private String workspaceTitle(Harness.State state) {
        String title = state != null ? state.workspaceTitle() : "";
        if (TextUtils.isEmpty(title)) title = prefs.harnessWorkspaceTitle();
        if (TextUtils.isEmpty(title)) return getString(R.string.harness_workspace_chip_default);
        return title;
    }

    /** 主机当前工作区完整 cwd（拿不到就是空串，行里不显示副标题）。 */
    private String workspaceCwd(Harness.State state) {
        String cwd = state != null ? state.workspace : "";
        if (TextUtils.isEmpty(cwd)) cwd = prefs.harnessWorkspace();
        return cwd;
    }

    /** 主机当前 Agent 预设名。 */
    private String presetTitle(Harness.State state) {
        String title = state != null ? state.presetTitle(state.agentPreset) : "";
        if (TextUtils.isEmpty(title)) title = prefs.harnessPresetTitle();
        if (TextUtils.isEmpty(title)) return getString(R.string.harness_preset_chip_default);
        return title;
    }

    /** 当前预设描述的首行（空串就不显示副标题）。 */
    private String presetHint(Harness.State state) {
        if (state == null) return "";
        String text = state.presetDescription(state.agentPreset);
        return text == null ? "" : text;
    }

    /** 当前模型：主机声明优先，拿不到就用手机上选中的那个。 */
    private String modelText(Harness.State state) {
        if (state != null && !TextUtils.isEmpty(state.model)) return state.model;
        return Seats.compactTitle(this, prefs);
    }

    /** 当前权限：主机声明优先，拿不到就用手机上选中的那个。 */
    private String permission(Harness.State state) {
        if (state != null && !TextUtils.isEmpty(state.permission)) return state.permission;
        return Seats.permission(prefs);
    }

    /** 底部摘要：主机自己声明的三个能力开关（能力名是协议里的 ASCII 词）。 */
    private String capabilityText(Harness.State state) {
        if (state == null) return getString(R.string.harness_loading);
        return "writeConfig " + (state.writeConfig ? "on" : "off")
                + " · listDirs " + (state.listDirs ? "on" : "off")
                + " · configEditor " + (state.configEditor ? "on" : "off");
    }

    private void showFontPage() {
        fontPage = true;
        root.removeAllViews();

        LinearLayout page = t.column();
        page.setBackgroundColor(pageBg());
        root.addView(page, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        page.addView(topBar(getString(R.string.font_size), true));

        final boolean follow = Prefs.fontFollowSystem(this);
        final float startScale = follow ? 1.0f : Prefs.fontScale(this);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        LinearLayout body = t.column();
        body.setPadding(t.dp(16), t.dp(24), t.dp(16), t.dp(24));
        scroll.addView(body, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        page.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        /* 预览气泡：右对齐、最大宽 70%、浅蓝底 20dp 圆角 */
        LinearLayout bubbleRow = t.row();
        bubbleRow.setGravity(Gravity.END);
        final TextView preview = t.text(getString(R.string.preview_font_size_msg1), 16f, t.text);
        preview.setBackground(t.round(t.bubble, 20f));
        preview.setPadding(t.dp(14), t.dp(14), t.dp(14), t.dp(14));
        preview.setMaxWidth((int) (getResources().getDisplayMetrics().widthPixels * 0.70f));
        preview.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f * startScale);
        bubbleRow.addView(preview);
        body.addView(bubbleRow, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView msg2 = t.text(getString(R.string.preview_font_size_msg2), 13f, t.muted);
        msg2.setLineSpacing(t.dp(5), 1f);
        LinearLayout.LayoutParams msg2Lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        msg2Lp.topMargin = t.dp(24);
        body.addView(msg2, msg2Lp);

        TextView msg3 = t.text(getString(R.string.preview_font_size_msg3), 13f, t.muted);
        msg3.setLineSpacing(t.dp(5), 1f);
        LinearLayout.LayoutParams msg3Lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        msg3Lp.topMargin = t.dp(8);
        body.addView(msg3, msg3Lp);

        /* 底部固定 sheet：上圆角 20dp + 顶部 1px 分隔线 */
        LinearLayout sheet = t.column();
        GradientDrawable sheetBg = new GradientDrawable();
        sheetBg.setColor(t.surface);
        float radius = t.dp(20);
        sheetBg.setCornerRadii(new float[]{radius, radius, radius, radius, 0f, 0f, 0f, 0f});
        sheet.setBackground(sheetBg);
        page.addView(sheet, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        View line = new View(this);
        line.setBackgroundColor(t.line);
        sheet.addView(line, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, t.dp(0.7f))));

        /* 跟随系统 */
        LinearLayout followRow = t.row();
        followRow.setGravity(Gravity.CENTER_VERTICAL);
        followRow.setPadding(t.dp(20), t.dp(24), t.dp(20), t.dp(6));
        TextView followLabel = t.text(getString(R.string.follow_system), 15f, t.text);
        followRow.addView(followLabel, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        final Switch switcher = new Switch(this);
        switcher.setChecked(follow);
        switcher.setThumbTintList(ColorStateList.valueOf(t.ok));
        switcher.setTrackTintList(ColorStateList.valueOf(Theme.alpha(t.ok, 0.38f)));
        followRow.addView(switcher, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        sheet.addView(followRow, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        /* A —— 当前档位 —— A（官方为字面「A」，左小右大） */
        LinearLayout sizeRow = t.row();
        sizeRow.setGravity(Gravity.CENTER_VERTICAL);
        sizeRow.setPadding(t.dp(20), t.dp(14), t.dp(20), 0);
        TextView smallA = t.text("A", 13f, t.text);
        sizeRow.addView(smallA);
        final TextView bucket = t.text(bucketLabel(progressOf(startScale)), 13f, t.text);
        bucket.setGravity(Gravity.CENTER);
        sizeRow.addView(bucket, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView largeA = t.text("A", 19f, t.text);
        sizeRow.addView(largeA);
        sheet.addView(sizeRow, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        /* 滑块 */
        final SeekBar seek = new SeekBar(this);
        seek.setMax(100);
        seek.setProgress(progressOf(startScale));
        seek.setPadding(t.dp(20), 0, t.dp(20), 0);
        seek.setSplitTrack(false);
        /* 官方轨道是实心灰线且刻度压在轨道上：自绘轨道 + 刻度，SeekBar 只留透明轨道与白色 thumb */
        seek.setProgressTintList(ColorStateList.valueOf(Color.TRANSPARENT));
        seek.setProgressBackgroundTintList(ColorStateList.valueOf(Color.TRANSPARENT));

        GradientDrawable thumb = new GradientDrawable();
        thumb.setShape(GradientDrawable.OVAL);
        thumb.setColor(t.surface);
        thumb.setStroke(Math.max(1, t.dp(1)), Theme.alpha(t.text, 0.18f));
        thumb.setSize(t.dp(22), t.dp(22));
        seek.setThumb(thumb);
        seek.setThumbOffset(t.dp(1));

        /* 官方在「跟随系统」开启时滑块外观不变（只是不可拖动），所以不做整体降透明 */
        seek.setEnabled(!follow);

        FrameLayout sliderBox = new FrameLayout(this);

        /* 轨道：3dp 圆角实线，左右与 SeekBar 的 20dp 内边距对齐 */
        View track = new View(this);
        track.setBackground(t.round(Theme.alpha(t.text, 0.24f), 1.5f));
        FrameLayout.LayoutParams trackLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, Math.max(2, t.dp(3)));
        trackLp.gravity = Gravity.TOP;
        trackLp.topMargin = t.dp(16);
        trackLp.leftMargin = t.dp(22);
        trackLp.rightMargin = t.dp(22);
        sliderBox.addView(track, trackLp);

        /* 刻度：7 个，竖线跨过轨道 */
        LinearLayout ticks = t.row();
        ticks.setGravity(Gravity.CENTER_VERTICAL);
        ticks.setPadding(t.dp(20), 0, t.dp(20), 0);
        for (int i = 0; i < 7; i++) {
            View tick = new View(this);
            tick.setBackgroundColor(Theme.alpha(t.text, 0.28f));
            ticks.addView(tick, new LinearLayout.LayoutParams(Math.max(2, t.dp(2)), t.dp(9)));
            if (i < 6) {
                View gap = new View(this);
                ticks.addView(gap, new LinearLayout.LayoutParams(0, 1, 1f));
            }
        }
        FrameLayout.LayoutParams ticksLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, t.dp(9));
        ticksLp.gravity = Gravity.TOP;
        ticksLp.topMargin = t.dp(13);
        sliderBox.addView(ticks, ticksLp);

        /* SeekBar 最后加入，让白色 thumb 压在轨道与刻度之上 */
        sliderBox.addView(seek, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout.LayoutParams seekLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(36));
        sheet.addView(sliderBox, seekLp);

        sheet.addView(spacer(t.dp(26)));
        /* 手势条/导航栏安全区：把 sheet 内容推离屏幕底边 */
        sheet.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int bottom = insets.getSystemWindowInsetBottom();
                if (v.getPaddingBottom() != bottom) {
                    v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), bottom);
                }
                return insets;
            }
        });

        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar bar, int progress, boolean fromUser) {
                preview.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f * scaleOf(progress));
                bucket.setText(bucketLabel(progress));
            }

            @Override
            public void onStartTrackingTouch(SeekBar bar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar bar) {
                prefs.setFontScale(scaleOf(bar.getProgress()));
            }
        });

        switcher.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton button, boolean checked) {
                prefs.setFontFollowSystem(checked);
                // 字号是全 App 的 Theme 令牌，重建界面才让所有页面按新档位重新排版。
                recreate();
            }
        });
    }

    /** fontScale(0.80~1.20) → 滑块 progress(0~100)，标准=50。 */
    private int progressOf(float scale) {
        int value = Math.round((scale - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * 100f);
        return Math.max(0, Math.min(100, value));
    }

    /** 滑块 progress(0~100) → fontScale(0.80~1.20)。 */
    private float scaleOf(int progress) {
        return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * (progress / 100f);
    }

    /** 五档文案；「标准」用官方资源，其余短语无资源可用就地写死。 */
    private String bucketLabel(int progress) {
        if (progress < 12) return getString(R.string.st_font_bucket_min);
        if (progress < 34) return getString(R.string.st_font_bucket_small);
        if (progress < 66) return getString(R.string.default_font_size);
        if (progress < 88) return getString(R.string.st_font_bucket_large);
        return getString(R.string.st_font_bucket_max);
    }
}
