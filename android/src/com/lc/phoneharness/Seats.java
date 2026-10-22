package com.lc.phoneharness;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.drawable.ColorDrawable;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.Window;
import android.view.WindowManager;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 桌面版 composer 上的两个「座位」：模型（含推理等级）与权限。
 *
 * 桌面形态（对照 dsh-web-frontend 的 Menu）：
 *  - 触发器 = 图标 + 文案 + chevronDown，点开是一个锚定在触发器上方的菜单；
 *  - 根面板两格：模型（值=模型名）、推理等级（值=effort 名），点任一格进子面板；
 *  - 模型子面板按 provider 分组，顶部一个搜索框即时过滤；
 *  - 推理等级子面板首项是 Default（= 不传 reasoningEffort）；
 *  - 选「完全权限」先弹风险确认（勾选后才允许启用）。
 *
 * 手机上把这两个触发器做成 composer 里两枚 pill，菜单改成 PopupWindow（锚定在 pill 上方）。
 *
 * 模型清单有两条来源（宿主新老版本都能用）：
 *  - 新版：GET /v1/models —— 带 providers/custom，能加外接模型、能删；
 *  - 旧版：宿主没有这个接口（404）时静默回落 GET /v1/catalog，面板照旧可用，
 *    只是不显示「添加外接模型」和长按删除。
 */
public final class Seats {

    private static JSONObject catalog;

    /** /v1/models 的快照；null = 宿主还是旧版（或还没拉到）。 */
    private static JSONObject modelsJson;
    private static volatile boolean modelsLoading;

    private Seats() {
    }

    /** 每次 /v1/catalog 拉回来就塞进来，两个页面共用同一个快照。 */
    public static synchronized void apply(JSONObject json) {
        if (json != null) catalog = json;
    }

    public static synchronized JSONObject catalog() {
        return catalog;
    }

    /** /v1/models 拉回来就塞进来；解析不出 providers 的（比如错误体）直接丢掉。 */
    public static synchronized void applyModels(JSONObject json) {
        if (json != null && json.optJSONArray("providers") != null) modelsJson = json;
    }

    /** 宿主支持 /v1/models：能选外接模型、能添加/删除。 */
    public static synchronized boolean modelsEndpoint() {
        return modelsJson != null;
    }

    public static boolean modelsLoading() {
        return modelsLoading;
    }

    /**
     * 拉一次模型清单：优先 /v1/models；旧宿主 404 时静默回落 /v1/catalog。
     * 回调永远在 UI 线程跑一次，调用方只需要在回调里刷新界面。
     */
    public static void refreshModels(final Activity host, final Prefs prefs, final Runnable after) {
        modelsLoading = true;
        final Api api = new Api(prefs);
        api.get("/v1/models", new Api.Callback() {
            @Override
            public void onOk(JSONObject body) {
                applyModels(body);
                done();
            }

            @Override
            public void onError(String message) {
                // 旧宿主：/v1/models 还没上线，退回原来的 /v1/catalog，
                // 模型面板照旧可用，只是不出现「添加外接模型」。
                api.get("/v1/catalog", new Api.Callback() {
                    @Override
                    public void onOk(JSONObject body) {
                        apply(body);
                        done();
                    }

                    @Override
                    public void onError(String message) {
                        done();
                    }
                });
            }

            private void done() {
                modelsLoading = false;
                if (after == null) return;
                host.runOnUiThread(after);
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* catalog / models 解析                                               */
    /* ------------------------------------------------------------------ */

    public static final class Model {
        public final String id;
        public final String title;
        public final String provider;
        public final String providerName;
        /** /v1/models 里的原始 model 字段（gpt-4o 之类），搜索也匹配它。 */
        public final String name;
        /** 外接模型（用户自己加的网关）。 */
        public final boolean custom;
        /** 外接模型所属的路由，删除接口用它。 */
        public final String route;

        Model(String id, String title, String provider, String providerName) {
            this(id, title, provider, providerName, "", false, "");
        }

        Model(String id, String title, String provider, String providerName,
              String name, boolean custom, String route) {
            this.id = id == null ? "" : id;
            this.title = title == null || title.length() == 0 ? shortId(this.id) : title;
            this.provider = provider == null ? "" : provider;
            this.providerName = providerName == null || providerName.length() == 0
                    ? this.provider : providerName;
            this.name = name == null ? "" : name;
            this.custom = custom;
            this.route = route == null ? "" : route;
        }
    }

    public static String shortId(String id) {
        if (id == null) return "";
        int slash = id.indexOf('/');
        return slash >= 0 ? id.substring(slash + 1) : id;
    }

    /** 模型 id 里的路由前缀（route/model → route）。 */
    public static String routeOf(String id) {
        if (id == null) return "";
        int slash = id.indexOf('/');
        return slash > 0 ? id.substring(0, slash) : "";
    }

    private static synchronized JSONObject snapshot() {
        return modelsJson != null ? modelsJson : catalog;
    }

    /** 模型清单：provider 顺序保持接口返回的顺序。 */
    public static List<Model> models() {
        List<Model> out = new ArrayList<Model>();
        JSONObject json = snapshot();
        if (json == null) return out;

        JSONArray providers = json.optJSONArray("providers");
        if (providers != null) {
            for (int p = 0; p < providers.length(); p++) {
                JSONObject provider = providers.optJSONObject(p);
                if (provider == null) continue;
                String pid = provider.optString("id", "");
                String pname = provider.optString("name", pid);
                boolean providerCustom = provider.optBoolean("custom", false);
                JSONArray rows = provider.optJSONArray("models");
                if (rows == null) continue;
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row == null) continue;
                    String id = row.optString("id", "");
                    if (id.length() == 0) continue;
                    boolean custom = row.optBoolean("custom", providerCustom);
                    String providerField = row.optString("provider", pid);
                    String route = (providerCustom || custom)
                            ? (pid.length() > 0 ? pid : providerField) : "";
                    out.add(new Model(id, row.optString("title", ""), providerField, pname,
                            row.optString("model", ""), custom, route));
                }
            }
            return out;
        }

        JSONArray array = json.optJSONArray("models");
        if (array == null) return out;
        for (int i = 0; i < array.length(); i++) {
            JSONObject row = array.optJSONObject(i);
            if (row == null) continue;
            String id = row.optString("id", "");
            if (id.length() == 0) continue;
            out.add(new Model(id, row.optString("title", ""), row.optString("provider", ""),
                    row.optString("providerName", "")));
        }
        return out;
    }

    private static JSONObject defaults() {
        JSONObject json = snapshot();
        return json == null ? null : json.optJSONObject("defaults");
    }

    public static String defaultModelId() {
        JSONObject d = defaults();
        return d == null ? "" : d.optString("model", "");
    }

    public static String defaultPermission() {
        JSONObject d = defaults();
        return d == null ? "" : d.optString("permission", "");
    }

    /** 推理等级候选值（high / max …），电脑端没开就是空表。 */
    public static List<String> efforts() {
        List<String> out = new ArrayList<String>();
        JSONObject json = catalog();
        if (json == null) return out;
        JSONObject reasoning = json.optJSONObject("reasoning");
        if (reasoning == null || !reasoning.optBoolean("supported", false)) return out;
        JSONArray values = reasoning.optJSONArray("values");
        if (values == null) return out;
        for (int i = 0; i < values.length(); i++) {
            String value = values.optString(i, "");
            if (value.length() > 0 && !out.contains(value)) out.add(value);
        }
        return out;
    }

    /** providerName 的中文说法：桌面端 deepseek-account 显示成「DeepSeek 账号」。 */
    public static String providerLabel(Context context, Model model) {
        if ("deepseek-account".equals(model.provider)) {
            return context.getString(R.string.seat_provider_account);
        }
        return model.providerName;
    }

    /* ------------------------------------------------------------------ */
    /* 生效值（用户选过就用用户的，否则跟随电脑端 default）                  */
    /* ------------------------------------------------------------------ */

    public static String modelId(Prefs prefs) {
        String value = prefs.modelId();
        if (value.length() > 0) return value;
        value = defaultModelId();
        if (value.length() > 0) return value;
        List<Model> all = models();
        return all.isEmpty() ? "" : all.get(0).id;
    }

    public static Model model(Prefs prefs) {
        String id = modelId(prefs);
        for (Model row : models()) {
            if (row.id.equals(id)) return row;
        }
        return null;
    }

    /** chip 上的模型文案：catalog 有就用 catalog 的 title，没有就用上次缓存的，再没有就显示短 id。 */
    public static String modelTitle(Context context, Prefs prefs) {
        Model row = model(prefs);
        if (row != null) return row.title;
        String cached = prefs.modelTitle();
        if (cached.length() > 0) return cached;
        String id = modelId(prefs);
        if (id.length() > 0) return shortId(id);
        return context.getString(R.string.seat_model_empty);
    }

    /**
     * chip 上放得下的模型名：手机 composer 一行只有 ~218dp 给两枚座位，
     * 而 catalog 里的模型名都带同一个 provider 前缀（DeepSeek-V4.1-Flash / DeepSeek-V4-Pro），
     * 全量显示会被省略成没有区分度的「DeepSeek…」。这里按「所有模型标题的最长公共前缀」做一次收窄。
     */
    public static String compactTitle(Context context, Prefs prefs) {
        String full = modelTitle(context, prefs);
        String prefix = commonPrefix(context);
        if (prefix.length() < 5 || full.length() <= prefix.length()) return full;
        // 公共前缀常常断在半个词里（DeepSeek-V4|.1-Flash），退到最后一个分隔符再切，
        // 这样「DeepSeek-V4.1-Flash / DeepSeek-V4-Pro」会收成「V4.1-Flash / V4-Pro」。
        int cut = Math.max(prefix.lastIndexOf('-'), prefix.lastIndexOf(' '));
        String trimPrefix = cut > 0 ? prefix.substring(0, cut + 1) : prefix;
        if (trimPrefix.length() < 5) trimPrefix = prefix;
        String rest = full.substring(trimPrefix.length()).trim();
        while (rest.startsWith("-") || rest.startsWith("_") || rest.startsWith(".")) {
            rest = rest.substring(1).trim();
        }
        return rest.length() == 0 ? full : rest;
    }

    /** 内置模型标题的最长公共前缀（只有一个模型时返回空）。 */
    private static String commonPrefix(Context context) {
        // 外接模型的标题是用户自己起的网关名（gpt-4o 之类），掺进来会把公共前缀打散，
        // chip 上就会重新变回被省略的「DeepSeek-V4.1-Flash」。只按内置模型收窄。
        List<Model> builtin = new ArrayList<Model>();
        for (Model row : models()) {
            if (!row.custom) builtin.add(row);
        }
        List<Model> all = builtin.size() >= 2 ? builtin : models();
        if (all.size() < 2) return "";
        String prefix = all.get(0).title;
        for (Model row : all) {
            String title = row.title;
            int end = Math.min(prefix.length(), title.length());
            int index = 0;
            while (index < end && prefix.charAt(index) == title.charAt(index)) index++;
            prefix = prefix.substring(0, index);
            if (prefix.length() == 0) break;
        }
        return prefix;
    }

    public static String permission(Prefs prefs) {
        String value = prefs.permission();
        if (value.length() > 0) return value;
        value = defaultPermission();
        if (value.length() > 0) return value;
        return "read-only";
    }

    public static String permLabel(Context context, String id) {
        if ("workspace-write".equals(id)) return context.getString(R.string.perm_workspace_write);
        if ("danger-full-access".equals(id)) return context.getString(R.string.perm_full_access);
        return context.getString(R.string.perm_read_only);
    }

    public static int permIcon(String id) {
        if ("workspace-write".equals(id)) return R.drawable.ic_perm_write;
        if ("danger-full-access".equals(id)) return R.drawable.ic_perm_full;
        return R.drawable.ic_perm_read;
    }

    /** 当前推理等级：空字符串就是 Default。 */
    public static String effort(Prefs prefs) {
        String value = prefs.reasoning();
        List<String> all = efforts();
        if (value.length() == 0 || all.isEmpty()) return "";
        return all.contains(value) ? value : "";
    }

    /** effort 显示名：adapter 就是首字母大写（high → High），Default 是「不传」。 */
    public static String effortLabel(Context context, String level) {
        if (level == null || level.length() == 0) {
            return context.getString(R.string.seat_effort_default);
        }
        return level.substring(0, 1).toUpperCase() + level.substring(1);
    }

    /* ------------------------------------------------------------------ */
    /* 触发器等宽估算：chip 上的字要单行省略，先算出能占多宽                    */
    /* ------------------------------------------------------------------ */

    private static int textWidth(Context context, String text, float sizeSp) {
        android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sizeSp,
                context.getResources().getDisplayMetrics()));
        return (int) Math.ceil(paint.measureText(text == null ? "" : text));
    }

    /* ------------------------------------------------------------------ */
    /* 菜单                                                                */
    /* ------------------------------------------------------------------ */

    private static final int ROOT = 0;
    private static final int PANE_MODEL = 1;
    private static final int PANE_EFFORT = 2;
    private static final int PANE_PERMISSION = 3;
    private static final int PANE_ADD = 4;

    /** 模型菜单：根面板（模型 / 推理等级）→ 两个子面板。 */
    public static void showModelMenu(final Activity host, final Theme t, final Prefs prefs,
                                     final View anchor, final Runnable onChanged) {
        final Menu menu = new Menu(host, t, prefs, anchor, onChanged);
        menu.openRoot();
        menu.loadModels();
    }

    /** 直接进模型面板（设置页那行进来的就是这里，没有根面板可回）。 */
    public static void showModelPanel(final Activity host, final Theme t, final Prefs prefs,
                                      final View anchor, final Runnable onChanged) {
        final Menu menu = new Menu(host, t, prefs, anchor, onChanged);
        menu.standalone = true;
        menu.openModel();
        menu.loadModels();
    }

    /** 权限菜单：一屏三选，选「完全权限」先过风险确认。 */
    public static void showPermissionMenu(final Activity host, final Theme t, final Prefs prefs,
                                          final View anchor, final Runnable onChanged) {
        final Menu menu = new Menu(host, t, prefs, anchor, onChanged);
        menu.openPermission();
    }

    private static final class Menu {
        private final Activity host;
        private final Theme t;
        private final Prefs prefs;
        private final View anchor;
        private final Runnable onChanged;

        private final PopupWindow win;
        private final LinearLayout panel;
        private final LinearLayout body;
        /** 固定在面板顶部的返回条 + 搜索框，不随列表滚动。 */
        private final LinearLayout head;

        private int pane = ROOT;
        private String query = "";
        /** 从设置页直接进模型面板：左上角返回直接关掉，而不是回到根面板。 */
        private boolean standalone;

        /** 表单字段（key → 输入框 / 就地错误提示）。 */
        private final Map<String, EditText> inputs = new LinkedHashMap<String, EditText>();
        private final Map<String, TextView> errors = new LinkedHashMap<String, TextView>();
        private TextView formError;
        private TextView saveButton;
        private ScrollView scrollView;
        /** 校验失败时第一个标红的提示，用来把它滚进可视区。 */
        private TextView firstError;
        private boolean submitting;

        private static final String ROUTE_PATTERN = "^[a-z0-9][a-z0-9_-]{1,31}$";
        private static final String URL_PATTERN = "^https?://[A-Za-z0-9._\\-]+(:\\d+)?(/\\S*)?$";
        private static final String ENV_PATTERN = "^[A-Z_][A-Z0-9_]{0,63}$";
        private static final String MODEL_PATTERN = "^[A-Za-z0-9._:/-]+$";

        Menu(Activity host, Theme t, Prefs prefs, View anchor, Runnable onChanged) {
            this.host = host;
            this.t = t;
            this.prefs = prefs;
            this.anchor = anchor;
            this.onChanged = onChanged;

            panel = t.column();
            panel.setClipChildren(true);
            panel.setClipToPadding(true);
            // 圆角卡片画在最外层 panel 上：返回条和搜索框固定在顶部，不跟着列表滚走。
            panel.setBackground(t.roundStroke(t.dark ? t.surfaceAlt : 0xFFFFFFFF,
                    t.dark ? t.line : 0x1A000000, 14f));
            final int cardRadius = t.dp(14);
            panel.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), cardRadius);
                }
            });
            panel.setClipToOutline(true);

            head = t.column();
            head.setPadding(0, t.dp(6), 0, 0);
            panel.addView(head, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

            body = t.column();

            ScrollView scroll = new ScrollView(host);
            scrollView = scroll;
            scroll.setClipChildren(true);
            scroll.setClipToPadding(true);
            scroll.setPadding(0, 0, 0, t.dp(6));
            scroll.setVerticalScrollBarEnabled(false);
            scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
            scroll.setBackground(null);
            scroll.addView(body, new ScrollView.LayoutParams(
                    ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
            panel.addView(scroll, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

            win = new PopupWindow(panel, t.dp(238), ViewGroup.LayoutParams.WRAP_CONTENT);
            win.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            win.setOutsideTouchable(true);
            win.setFocusable(true);
            win.setElevation(t.dp(10));
        }

        void openRoot() {
            pane = ROOT;
            fill();
            show();
        }

        void openModel() {
            pane = PANE_MODEL;
            fill();
            show();
        }

        void openPermission() {
            pane = PANE_PERMISSION;
            fill();
            show();
        }

        /** 打开就顺手把 /v1/models 拉一遍（旧宿主自动回落 catalog）。 */
        void loadModels() {
            Seats.refreshModels(host, prefs, new Runnable() {
                @Override
                public void run() {
                    if (pane == PANE_MODEL) refill();
                    if (onChanged != null) onChanged.run();
                }
            });
        }

        private int paneWidth() {
            return t.dp(pane == PANE_ADD ? 300 : 238);
        }

        private void show() {
            int width = paneWidth();
            int height = measureHeight(width);
            int[] at = position(width, height);
            win.setWidth(width);
            win.setHeight(height);
            win.showAtLocation(anchor, Gravity.TOP | Gravity.START, at[0], at[1]);
        }

        /** 内容自然高度（含上下 6dp 内边距），超过上限就滚动。 */
        private int measureHeight(int width) {
            head.measure(android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                    android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED));
            body.measure(android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
                    android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED));
            int content = head.getMeasuredHeight() + body.getMeasuredHeight() + t.dp(6);
            int screen = host.getResources().getDisplayMetrics().heightPixels;
            int cap = Math.min(pane == PANE_ADD ? t.dp(560) : t.dp(392), screen - t.dp(24));
            return Math.min(content, cap);
        }

        private int[] position(int width, int height) {
            int[] loc = new int[2];
            anchor.getLocationOnScreen(loc);
            int screenWidth = host.getResources().getDisplayMetrics().widthPixels;
            int screenHeight = host.getResources().getDisplayMetrics().heightPixels;
            int x = loc[0];
            if (x + width > screenWidth - t.dp(8)) x = screenWidth - t.dp(8) - width;
            if (x < t.dp(8)) x = t.dp(8);
            int y = loc[1] - height - t.dp(6);
            int below = loc[1] + anchor.getHeight() + t.dp(6);
            if (y < t.dp(8) && below + height <= screenHeight - t.dp(8)) y = below;
            if (y > screenHeight - height - t.dp(8)) y = screenHeight - height - t.dp(8);
            if (y < t.dp(8)) y = t.dp(8);
            return new int[]{x, y};
        }

        /** 换面板后内容高度/宽度会变，重新量一次并挪位置。 */
        private void refill() {
            fill();
            resize();
        }

        /** 内容变了（比如表单标红）但不想重建视图时，只重新量高度。 */
        private void resize() {
            if (!win.isShowing()) return;
            int width = paneWidth();
            int height = measureHeight(width);
            int[] at = position(width, height);
            win.update(at[0], at[1], width, height);
        }

        /** 只重画模型清单（搜索框保持焦点，不重建整个面板）。 */
        private void refillList(LinearLayout list) {
            renderModels(list);
            resize();
        }

        private void fill() {
            body.removeAllViews();
            head.removeAllViews();
            if (pane == ROOT) {
                fillRoot();
            } else if (pane == PANE_MODEL) {
                fillModel();
            } else if (pane == PANE_EFFORT) {
                fillEffort();
            } else if (pane == PANE_ADD) {
                fillAdd();
            } else {
                fillPermission();
            }
        }

        private void fillRoot() {
            String title = compactTitle(host, prefs);
            body.addView(rootRow(R.drawable.ic_data, host.getString(R.string.seat_model), title,
                    new View.OnClickListener() {
                        @Override
                        public void onClick(View view) {
                            pane = PANE_MODEL;
                            refill();
                        }
                    }));

            if (!efforts().isEmpty()) {
                body.addView(rootRow(R.drawable.ic_think, host.getString(R.string.seat_effort),
                        effortLabel(host, effort(prefs)), new View.OnClickListener() {
                            @Override
                            public void onClick(View view) {
                                pane = PANE_EFFORT;
                                refill();
                            }
                        }));
            }
        }

        /* -------------------------- 模型面板 -------------------------- */

        private void fillModel() {
            head.addView(header(host.getString(R.string.seat_model), standalone ? -1 : ROOT));
            head.addView(searchField(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {
                }

                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {
                }

                @Override
                public void afterTextChanged(Editable s) {
                    query = s.toString().trim().toLowerCase();
                    LinearLayout list = listHolder;
                    if (list == null) return;
                    refillList(list);
                }
            }));

            LinearLayout list = t.column();
            listHolder = list;
            body.addView(list, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            renderModels(list);

            // 旧宿主没有 /v1/models：不显示添加入口（也就没有删除）。
            if (modelsEndpoint()) {
                View line = t.hairline();
                LinearLayout.LayoutParams lineLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, t.dp(0.7f)));
                lineLp.leftMargin = t.dp(14);
                lineLp.rightMargin = t.dp(14);
                lineLp.topMargin = t.dp(4);
                body.addView(line, lineLp);
                body.addView(addRow());
            }
        }

        /** 模型清单容器：搜索框的 TextWatcher 直接重画它，别重建整个面板。 */
        private LinearLayout listHolder;

        private void renderModels(LinearLayout list) {
            list.removeAllViews();
            String current = modelId(prefs);
            List<Model> all = models();
            if (all.isEmpty()) {
                list.addView(note(host.getString(modelsLoading()
                        ? R.string.seat_loading_models : R.string.seat_no_models)));
                return;
            }
            List<Model> builtin = new ArrayList<Model>();
            List<Model> custom = new ArrayList<Model>();
            for (Model row : all) {
                if (!matches(row)) continue;
                if (row.custom) custom.add(row);
                else builtin.add(row);
            }
            if (builtin.isEmpty() && custom.isEmpty()) {
                list.addView(note(host.getString(R.string.seat_no_match)));
                return;
            }
            addGroups(list, builtin, current);
            if (!custom.isEmpty()) {
                list.addView(sectionHeader(host.getString(R.string.seat_custom_section)));
                addGroups(list, custom, current);
            }
        }

        /** 搜索匹配 title / model / 模型 id / provider 名，忽略大小写。 */
        private boolean matches(Model row) {
            if (query.length() == 0) return true;
            return row.title.toLowerCase().contains(query)
                    || row.id.toLowerCase().contains(query)
                    || row.name.toLowerCase().contains(query)
                    || providerLabel(host, row).toLowerCase().contains(query)
                    || row.route.toLowerCase().contains(query);
        }

        private void addGroups(LinearLayout list, List<Model> rows, String current) {
            Map<String, List<Model>> groups = new LinkedHashMap<String, List<Model>>();
            for (Model row : rows) {
                String key = providerLabel(host, row);
                List<Model> bucket = groups.get(key);
                if (bucket == null) {
                    bucket = new ArrayList<Model>();
                    groups.put(key, bucket);
                }
                bucket.add(row);
            }
            for (Map.Entry<String, List<Model>> entry : groups.entrySet()) {
                list.addView(groupHeader(entry.getKey()));
                for (final Model row : entry.getValue()) {
                    View.OnLongClickListener hold = null;
                    if (row.custom) {
                        hold = new View.OnLongClickListener() {
                            @Override
                            public boolean onLongClick(View view) {
                                confirmDelete(row);
                                return true;
                            }
                        };
                    }
                    list.addView(itemRow(row.title, row.id.equals(current), 0,
                            new View.OnClickListener() {
                                @Override
                                public void onClick(View view) {
                                    selectModel(row);
                                }
                            }, hold));
                }
            }
        }

        /** 选中即生效：先写本地 prefs（会话创建时带 model），再同步电脑端默认值。 */
        private void selectModel(final Model row) {
            prefs.setModel(row.id, row.title);
            // 换模型后旧推理档位可能不被新模型支持（服务端会直接拒绝，表现为发送失败），
            // 先归位 Default，再拉一次清单让「推理等级」按新模型能力刷新。
            prefs.setReasoning("");
            pushDefault(row.id);
            loadModels();
            dismissAnd(onChanged);
        }

        private void pushDefault(final String modelId) {
            JSONObject body = new JSONObject();
            try {
                body.put("model", modelId);
                String level = prefs.reasoning();
                if (level.length() > 0) body.put("reasoning", level);
            } catch (Exception error) {
                return;
            }
            // 失败不阻塞：本地选择已生效，创建会话时会带上 model。
            new Api(prefs).post("/v1/models/default", body, new Api.Callback() {
                @Override
                public void onOk(JSONObject body) {
                }

                @Override
                public void onError(String message) {
                }
            });
        }

        /** 长按外接模型 → 确认删除。 */
        private void confirmDelete(final Model row) {
            new AlertDialog.Builder(host)
                    .setTitle(host.getString(R.string.seat_delete_title))
                    .setMessage(host.getString(R.string.seat_delete_desc, row.route))
                    .setNegativeButton(host.getString(R.string.cancel), null)
                    .setPositiveButton(host.getString(R.string.seat_delete_action),
                            new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    deleteCustom(row.route);
                                }
                            })
                    .show();
        }

        private void deleteCustom(final String route) {
            new Api(prefs).delete("/v1/models/custom/" + Api.enc(route), new Api.Result() {
                @Override
                public void onOk(JSONObject body) {
                    if (route.equals(routeOf(prefs.modelId()))) prefs.setModel("", "");
                    host.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(host, host.getString(R.string.seat_deleted),
                                    Toast.LENGTH_SHORT).show();
                            if (onChanged != null) onChanged.run();
                            loadModels();
                        }
                    });
                }

                @Override
                public void onFail(final String message, final Api.HttpError error) {
                    host.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(host, failureText(error, message),
                                    Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            });
        }

        /* -------------------------- 添加外接模型 -------------------------- */

        private void fillAdd() {
            inputs.clear();
            errors.clear();
            submitting = false;

            head.addView(header(host.getString(R.string.seat_model), PANE_MODEL));

            TextView title = t.strong(host.getString(R.string.seat_add_custom), 14f, t.text);
            title.setPadding(t.dp(14), t.dp(2), t.dp(14), t.dp(2));
            body.addView(title);

            addField("displayName", R.string.seat_field_display_name, R.string.seat_field_display_name_hint,
                    InputType.TYPE_CLASS_TEXT, prefs.debug("addName"));
            addField("route", R.string.seat_field_route, R.string.seat_field_route_hint,
                    InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
                    prefs.debug("addRoute"));
            addField("baseUrl", R.string.seat_field_base_url, R.string.seat_field_base_url_hint,
                    InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
                            | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
                    prefs.debug("addBase"));
            addField("env", R.string.seat_field_env, R.string.seat_field_env_hint,
                    InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
                    prefs.debug("addEnv"));
            addField("models", R.string.seat_field_models, R.string.seat_field_models_hint,
                    InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
                    prefs.debug("addModels"));
            addField("context", R.string.seat_field_context, R.string.seat_field_context_hint,
                    InputType.TYPE_CLASS_NUMBER, "");
            addField("maxTokens", R.string.seat_field_max_tokens, R.string.seat_field_max_tokens_hint,
                    InputType.TYPE_CLASS_NUMBER, "");

            formError = t.text("", 11.5f, t.bad);
            formError.setVisibility(View.GONE);
            // 出现时从 0 淡入（收起仍是硬切，见 fieldError 注释）。
            formError.setAlpha(0f);
            formError.setPadding(t.dp(15), t.dp(6), t.dp(15), 0);
            body.addView(formError);

            saveButton = t.strong(host.getString(R.string.seat_save), 14f, t.onAccent);
            saveButton.setGravity(Gravity.CENTER);
            saveButton.setBackground(t.rippleOn(t.accent, 12f));
            saveButton.setClickable(true);
            saveButton.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    submit();
                }
            });
            LinearLayout.LayoutParams saveLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(42));
            saveLp.setMargins(t.dp(14), t.dp(10), t.dp(14), t.dp(8));
            body.addView(saveButton, saveLp);
        }

        private void addField(String key, int labelRes, int hintRes, int inputType, String prefill) {
            TextView label = t.text(host.getString(labelRes), 11.5f, t.muted2);
            label.setPadding(t.dp(15), t.dp(6), t.dp(15), 0);
            body.addView(label);

            EditText input = new EditText(host);
            input.setSingleLine(true);
            input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            input.setTextColor(t.text);
            input.setHintTextColor(t.muted2);
            input.setHint(hintRes);
            input.setInputType(inputType);
            input.setBackground(t.pill(t.dark ? 0xFF2A2A2A : t.surfaceAlt));
            input.setPadding(t.dp(12), t.dp(7), t.dp(12), t.dp(7));
            if (prefill != null && prefill.length() > 0) {
                input.setText(prefill);
                input.setSelection(input.getText().length());
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMargins(t.dp(14), t.dp(5), t.dp(14), 0);
            body.addView(input, lp);

            TextView error = t.text("", 11f, t.bad);
            error.setVisibility(View.GONE);
            error.setAlpha(0f);
            error.setPadding(t.dp(15), t.dp(4), t.dp(15), 0);
            body.addView(error);

            inputs.put(key, input);
            errors.put(key, error);
        }

        private String value(String key) {
            EditText input = inputs.get(key);
            return input == null ? "" : input.getText().toString().trim();
        }

        private void fieldError(String key, String message) {
            TextView view = errors.get(key);
            if (view == null) return;
            view.setText(message);
            if (message.length() == 0) {
                // 收起保持硬切：这一行的可见性参与面板高度丈量（submit() 里随后就 resize()），
                // 把 GONE 延后 150ms 会让面板为它多留一段空白，直到下一次 resize 才补回来。
                view.setAlpha(0f);
                view.setVisibility(View.GONE);
            } else {
                // 出现才补动效：可见性照旧同步置位，后面的 resize() 仍旧量得到这一行。
                view.setVisibility(View.VISIBLE);
                Motion.cancel(view);
                Motion.fadeIn(view, Motion.durFade(host, Motion.DUR_TOGGLE)).start();
            }
            if (message.length() > 0 && firstError == null) firstError = view;
        }

        /** 列表比面板高的时候，把第一条错误滚进视野，用户才知道为什么存不下去。 */
        private void revealFirstError() {
            final TextView target = firstError;
            if (scrollView == null || target == null) return;
            scrollView.post(new Runnable() {
                @Override
                public void run() {
                    int top = target.getTop() - t.dp(64);
                    scrollView.smoothScrollTo(0, Math.max(0, top));
                }
            });
        }

        private void clearErrors() {
            firstError = null;
            for (String key : errors.keySet()) fieldError(key, "");
            if (formError != null) {
                formError.setText("");
                formError.setAlpha(0f);
                formError.setVisibility(View.GONE);
            }
        }

        private void showFormError(String message) {
            if (formError == null) return;
            if (message.length() == 0) {
                formError.setText("");
                formError.setAlpha(0f);
                formError.setVisibility(View.GONE);
                return;
            }
            formError.setText(message);
            formError.setVisibility(View.VISIBLE);
            Motion.cancel(formError);
            Motion.fadeIn(formError, Motion.durFade(host, Motion.DUR_TOGGLE)).start();
        }

        /** 前置校验：与宿主同一套正则，错了就地标红，不浪费一次请求。 */
        private void submit() {
            if (submitting) return;
            clearErrors();

            final String display = value("displayName");
            final String route = value("route");
            final String base = value("baseUrl");
            final String env = value("env");
            final String rawModels = value("models");
            final String context = value("context");
            final String maxTokens = value("maxTokens");

            boolean ok = true;
            if (!route.matches(ROUTE_PATTERN)) {
                fieldError("route", host.getString(R.string.seat_err_route));
                ok = false;
            }
            if (!base.matches(URL_PATTERN)) {
                fieldError("baseUrl", host.getString(R.string.seat_err_base_url));
                ok = false;
            }
            if (!env.matches(ENV_PATTERN)) {
                fieldError("env", host.getString(R.string.seat_err_env));
                ok = false;
            }
            final List<String> ids = splitModels(rawModels);
            if (ids.isEmpty() || !allModels(ids)) {
                fieldError("models", host.getString(R.string.seat_err_models));
                ok = false;
            }
            int contextValue = 0;
            int maxTokensValue = 0;
            if (context.length() > 0) {
                contextValue = positive(context);
                if (contextValue <= 0) {
                    fieldError("context", host.getString(R.string.seat_err_number));
                    ok = false;
                }
            }
            if (maxTokens.length() > 0) {
                maxTokensValue = positive(maxTokens);
                if (maxTokensValue <= 0) {
                    fieldError("maxTokens", host.getString(R.string.seat_err_number));
                    ok = false;
                }
            }
            if (!ok) {
                // 只重新量高度，别重建面板：重建会把输入值丢掉、错误提示也一起清掉。
                resize();
                revealFirstError();
                return;
            }

            final JSONObject payload = new JSONObject();
            try {
                payload.put("route", route);
                payload.put("displayName", display.length() == 0 ? route : display);
                payload.put("baseURL", base);
                payload.put("apiKeyEnv", env);
                JSONArray array = new JSONArray();
                for (String id : ids) array.put(id);
                payload.put("modelIds", array);
                if (contextValue > 0) payload.put("contextWindow", contextValue);
                if (maxTokensValue > 0) payload.put("maxTokens", maxTokensValue);
            } catch (Exception error) {
                showFormError(Api.message(error));
                resize();
                return;
            }

            beginSubmit();
            new Api(prefs).postFor("/v1/models/custom", payload, new Api.Result() {
                @Override
                public void onOk(JSONObject body) {
                    host.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            submitting = false;
                            Toast.makeText(host, host.getString(R.string.seat_added),
                                    Toast.LENGTH_SHORT).show();
                            pane = PANE_MODEL;
                            refill();
                            loadModels();
                        }
                    });
                }

                @Override
                public void onFail(final String message, final Api.HttpError error) {
                    host.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            submitting = false;
                            if (saveButton != null) {
                                saveButton.setEnabled(true);
                                saveButton.animate().alpha(1f)
                                        .setDuration(Motion.durMotion(host, Motion.DUR_TOGGLE))
                                        .setInterpolator(Motion.EASE_STANDARD).start();
                                saveButton.setText(host.getString(R.string.seat_save));
                            }
                            String code = error == null ? "" : error.code;
                            if ("bad_route".equals(code)) {
                                fieldError("route", host.getString(R.string.seat_code_route));
                            } else if ("bad_base_url".equals(code)) {
                                fieldError("baseUrl", host.getString(R.string.seat_code_base_url));
                            } else if ("bad_env".equals(code)) {
                                fieldError("env", host.getString(R.string.seat_code_env));
                            } else if ("bad_models".equals(code)) {
                                fieldError("models", host.getString(R.string.seat_code_models));
                            } else {
                                showFormError(failureText(error, message));
                            }
                            // 提示文字是后加的，面板要重新量一次，否则保存按钮会被裁掉。
                            resize();
                            revealFirstError();
                        }
                    });
                }
            });
        }

        private void beginSubmit() {
            if (saveButton == null) return;
            submitting = true;
            saveButton.setEnabled(false);
            saveButton.animate().alpha(0.5f)
                    .setDuration(Motion.durMotion(host, Motion.DUR_TOGGLE))
                    .setInterpolator(Motion.EASE_STANDARD).start();
            saveButton.setText(host.getString(R.string.seat_saving));
        }

        private List<String> splitModels(String raw) {
            List<String> out = new ArrayList<String>();
            if (raw == null) return out;
            String[] parts = raw.split("[,，\\s]+");
            for (String part : parts) {
                String value = part == null ? "" : part.trim();
                if (value.length() > 0 && !out.contains(value)) out.add(value);
            }
            return out;
        }

        private boolean allModels(List<String> ids) {
            for (String id : ids) {
                if (!id.matches(MODEL_PATTERN)) return false;
            }
            return true;
        }

        private int positive(String raw) {
            if (raw == null || !raw.matches("\\d{1,9}")) return 0;
            try {
                return Integer.parseInt(raw);
            } catch (Exception error) {
                return 0;
            }
        }

        /** 宿主错误码 → 中文原因。 */
        private String failureText(Api.HttpError error, String message) {
            String code = error == null ? "" : error.code;
            if ("bad_route".equals(code)) return host.getString(R.string.seat_code_route);
            if ("bad_base_url".equals(code)) return host.getString(R.string.seat_code_base_url);
            if ("bad_env".equals(code)) return host.getString(R.string.seat_code_env);
            if ("bad_models".equals(code)) return host.getString(R.string.seat_code_models);
            if ("custom_exists".equals(code)) return host.getString(R.string.seat_code_exists);
            if ("config_unavailable".equals(code)) return host.getString(R.string.seat_code_unavailable);
            if ("unknown_custom".equals(code)) return host.getString(R.string.seat_code_unknown);
            return message == null || message.length() == 0
                    ? host.getString(R.string.seat_code_unknown) : message;
        }

        /* -------------------------- 推理等级 / 权限 -------------------------- */

        private void fillEffort() {
            head.addView(header(host.getString(R.string.seat_effort), ROOT));
            List<String> all = efforts();
            if (all.isEmpty()) {
                body.addView(note(host.getString(R.string.seat_no_efforts)));
                return;
            }
            String current = effort(prefs);
            body.addView(itemRow(effortLabel(host, ""), current.length() == 0, 0,
                    new View.OnClickListener() {
                        @Override
                        public void onClick(View view) {
                            prefs.setReasoning("");
                            dismissAnd(onChanged);
                        }
                    }));
            for (final String level : all) {
                body.addView(itemRow(effortLabel(host, level), level.equals(current), 0,
                        new View.OnClickListener() {
                            @Override
                            public void onClick(View view) {
                                prefs.setReasoning(level);
                                dismissAnd(onChanged);
                            }
                        }));
            }
        }

        private void fillPermission() {
            String current = permission(prefs);
            String[] ids = {"read-only", "workspace-write", "danger-full-access"};
            for (final String id : ids) {
                body.addView(itemRow(permLabel(host, id), id.equals(current), permIcon(id),
                        new View.OnClickListener() {
                            @Override
                            public void onClick(View view) {
                                if ("danger-full-access".equals(id)) {
                                    win.dismiss();
                                    confirmFullAccess(host, t, new Runnable() {
                                        @Override
                                        public void run() {
                                            prefs.setPermission(id);
                                            if (onChanged != null) onChanged.run();
                                        }
                                    });
                                    return;
                                }
                                prefs.setPermission(id);
                                dismissAnd(onChanged);
                            }
                        }));
            }
        }

        private void dismissAnd(Runnable after) {
            win.dismiss();
            if (after != null) after.run();
        }

        /* -------------------------- 行控件 -------------------------- */

        private View rootRow(int iconRes, String label, String value, View.OnClickListener click) {
            LinearLayout box = t.row();
            box.setGravity(Gravity.CENTER_VERTICAL);
            box.setPadding(t.dp(14), 0, t.dp(12), 0);
            box.setBackground(t.ripple(12f));
            box.setClickable(true);
            box.setOnClickListener(click);

            box.addView(t.icon(iconRes, t.muted, 15));

            TextView name = t.text(label, 14f, t.text);
            LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            nameLp.leftMargin = t.dp(10);
            box.addView(name, nameLp);

            box.addView(new View(host), new LinearLayout.LayoutParams(0, 1, 1f));

            TextView valueView = t.text(value, 12f, t.muted2);
            valueView.setSingleLine(true);
            valueView.setEllipsize(TextUtils.TruncateAt.END);
            valueView.setMaxWidth(t.dp(112));
            valueView.setGravity(Gravity.END);
            box.addView(valueView);

            android.widget.ImageView chevron = t.icon(R.drawable.ic_chevron_right, t.muted2, 12);
            LinearLayout.LayoutParams chevronLp = new LinearLayout.LayoutParams(t.dp(12), t.dp(12));
            chevronLp.leftMargin = t.dp(2);
            box.addView(chevron, chevronLp);

            box.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(44)));
            return box;
        }

        /** 子面板顶部的返回条：‹ + 标题，点回上一级（backTo < 0 表示直接关掉）。 */
        private View header(final String title, final int backTo) {
            LinearLayout box = t.row();
            box.setGravity(Gravity.CENTER_VERTICAL);
            box.setPadding(t.dp(10), 0, t.dp(12), 0);
            box.setBackground(t.ripple(12f));
            box.setClickable(true);
            box.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    if (backTo < 0) {
                        win.dismiss();
                        return;
                    }
                    pane = backTo;
                    refill();
                }
            });
            box.addView(t.icon(R.drawable.ic_back, t.muted2, 14),
                    new LinearLayout.LayoutParams(t.dp(18), t.dp(18)));
            TextView label = t.text(title, 12f, t.muted2);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.leftMargin = t.dp(6);
            box.addView(label, lp);
            box.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(38)));
            return box;
        }

        private View groupHeader(String label) {
            TextView view = t.text(label, 11f, t.muted2);
            view.setSingleLine(true);
            view.setEllipsize(TextUtils.TruncateAt.END);
            view.setPadding(t.dp(14), t.dp(9), t.dp(14), t.dp(3));
            return view;
        }

        /** 「外接模型」这类分区小标题：比 provider 名稍重一点。 */
        private View sectionHeader(String label) {
            LinearLayout box = t.column();
            box.setPadding(t.dp(14), t.dp(12), t.dp(14), t.dp(2));
            TextView view = t.text(label, 12f, t.muted);
            box.addView(view);
            return box;
        }

        private View itemRow(String label, boolean selected, int iconRes, View.OnClickListener click) {
            return itemRow(label, selected, iconRes, click, null);
        }

        private View itemRow(String label, boolean selected, int iconRes, View.OnClickListener click,
                             View.OnLongClickListener hold) {
            LinearLayout box = t.row();
            box.setGravity(Gravity.CENTER_VERTICAL);
            box.setPadding(t.dp(14), 0, t.dp(12), 0);
            box.setBackground(t.ripple(10f));
            box.setClickable(true);
            box.setOnClickListener(click);
            if (hold != null) {
                box.setLongClickable(true);
                box.setOnLongClickListener(hold);
            }

            if (iconRes != 0) {
                box.addView(t.icon(iconRes, selected ? t.accent : t.text, 16));
                box.addView(new View(host), new LinearLayout.LayoutParams(t.dp(10), 1));
            }

            TextView name = t.text(label, 14f, selected ? t.accent : t.text);
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            box.addView(name, new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            if (selected) {
                box.addView(t.icon(R.drawable.ic_check, t.accent, 14),
                        new LinearLayout.LayoutParams(t.dp(14), t.dp(14)));
            }
            box.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(42)));
            return box;
        }

        /** 底部「＋ 添加外接模型」。 */
        private View addRow() {
            LinearLayout box = t.row();
            box.setGravity(Gravity.CENTER_VERTICAL);
            box.setPadding(t.dp(14), 0, t.dp(12), 0);
            box.setBackground(t.ripple(10f));
            box.setClickable(true);
            box.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    pane = PANE_ADD;
                    refill();
                }
            });
            box.addView(t.icon(R.drawable.ic_plus, t.accent, 14),
                    new LinearLayout.LayoutParams(t.dp(14), t.dp(14)));
            TextView label = t.strong(host.getString(R.string.seat_add_custom), 13.5f, t.accent);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.leftMargin = t.dp(8);
            box.addView(label, lp);
            box.setLayoutParams(new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(44)));
            return box;
        }

        private View note(String text) {
            TextView view = t.text(text, 12f, t.muted2);
            view.setPadding(t.dp(14), t.dp(10), t.dp(14), t.dp(12));
            return view;
        }

        /** 圆角搜索框：左侧 ic_search + 输入框，输入即过滤。 */
        private View searchField(TextWatcher watcher) {
            LinearLayout box = t.row();
            box.setGravity(Gravity.CENTER_VERTICAL);
            box.setBackground(t.pill(t.dark ? 0xFF2A2A2A : t.surfaceAlt));
            box.setPadding(t.dp(10), 0, t.dp(10), 0);

            box.addView(t.icon(R.drawable.ic_search, t.muted2, 14),
                    new LinearLayout.LayoutParams(t.dp(14), t.dp(14)));

            EditText input = new EditText(host);
            input.setSingleLine(true);
            input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            input.setTextColor(t.text);
            input.setHintTextColor(t.muted2);
            input.setHint(R.string.seat_search_model_hint);
            input.setBackground(null);
            input.setPadding(t.dp(6), t.dp(7), 0, t.dp(7));
            input.setInputType(InputType.TYPE_CLASS_TEXT);
            // 换成别的面板再回来时，把已有过滤词填回去（先填再加监听，避免自触发）。
            String probe = query.length() > 0 ? query : prefs.debug("modelQuery");
            if (probe.length() > 0) {
                input.setText(probe);
                input.setSelection(input.getText().length());
                query = probe.trim().toLowerCase();
            }
            input.addTextChangedListener(watcher);
            box.addView(input, new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMargins(t.dp(10), t.dp(4), t.dp(10), t.dp(6));
            box.setLayoutParams(lp);
            return box;
        }
    }

    /* ------------------------------------------------------------------ */
    /* 完全权限的风险确认                                                   */
    /* ------------------------------------------------------------------ */

    public static void confirmFullAccess(final Activity host, Theme t, final Runnable onConfirm) {
        final Dialog dialog = new Dialog(host);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(t.dp(20), t.dp(18), t.dp(20), t.dp(12));

        TextView title = t.strong(host.getString(R.string.perm_confirm_title), 16f, t.text);
        title.setGravity(Gravity.CENTER);
        card.addView(title);

        TextView desc = t.text(host.getString(R.string.perm_confirm_desc), 13f, t.muted);
        desc.setLineSpacing(t.dp(3), 1f);
        LinearLayout.LayoutParams descLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        descLp.topMargin = t.dp(10);
        card.addView(desc, descLp);

        final CheckBox ack = new CheckBox(host);
        ack.setText(host.getString(R.string.perm_confirm_ack));
        ack.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        ack.setTextColor(t.text);
        ack.setButtonTintList(android.content.res.ColorStateList.valueOf(t.text));
        LinearLayout.LayoutParams ackLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ackLp.topMargin = t.dp(12);
        card.addView(ack, ackLp);

        LinearLayout buttons = t.row();
        buttons.setGravity(Gravity.END);
        LinearLayout.LayoutParams buttonsLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonsLp.topMargin = t.dp(8);
        card.addView(buttons, buttonsLp);

        TextView cancel = t.text(host.getString(R.string.cancel), 14f, t.muted);
        cancel.setPadding(t.dp(12), t.dp(10), t.dp(12), t.dp(10));
        cancel.setBackground(t.ripple(10f));
        cancel.setClickable(true);
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });
        buttons.addView(cancel);

        final TextView enable = t.strong(host.getString(R.string.perm_enable), 14f, t.accent);
        enable.setPadding(t.dp(12), t.dp(10), t.dp(12), t.dp(10));
        enable.setBackground(t.ripple(10f));
        enable.setClickable(true);
        enable.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (!ack.isChecked()) {
                    android.widget.Toast.makeText(host, host.getString(R.string.perm_confirm_ack),
                            android.widget.Toast.LENGTH_SHORT).show();
                    return;
                }
                dialog.dismiss();
                if (onConfirm != null) onConfirm.run();
            }
        });
        buttons.addView(enable);

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
    }

    /* ------------------------------------------------------------------ */
    /* 用户主机 harness：工作区 / Agent 预设（移动端底部面板）                */
    /* ------------------------------------------------------------------ */

    /** 工作区面板：最近工作区 + 浏览主机目录；选中的写进主机 harness 配置。 */
    public static void showWorkspacePanel(final Activity host, final Theme t, final Prefs prefs,
                                          final View anchor, final Runnable onChanged) {
        final Sheet sheet = new Sheet(host, t, prefs, anchor, onChanged);
        // 契约 §3.2 v1.3.3：先用缓存画首帧（不阻塞），随后**无条件**拉一次主机状态——
        // 缓存非空但内容为空 / 过期时也必须刷新，否则名册永远拿不到、面板永远是空的。
        fillWorkspace(sheet);
        sheet.show();
        refreshPanel(sheet);
    }

    /** Agent 预设面板：说明 + 内置/自定义分组；选中的写进主机 harness 配置。 */
    public static void showPresetPanel(final Activity host, final Theme t, final Prefs prefs,
                                       final View anchor, final Runnable onChanged) {
        final Sheet sheet = new Sheet(host, t, prefs, anchor, onChanged);
        fillPreset(sheet);
        sheet.show();
        refreshPanel(sheet);
    }

    /**
     * 面板打开后无条件后台刷新一次（契约 §3.2 v1.3.3）。
     * 数据回来时面板还开着才重画；已经关掉就什么都不做，避免往关闭的视图里写。
     */
    private static void refreshPanel(final Sheet sheet) {
        Harness.refresh(sheet.host, sheet.prefs, new Runnable() {
            @Override
            public void run() {
                if (!sheet.isOpen()) return;
                sheet.refill();
                sheet.resize();
                if (sheet.onChanged != null) sheet.onChanged.run();
            }
        });
    }

    /* ---------------- 工作区面板 ---------------- */

    private static void fillWorkspace(final Sheet sheet) {
        sheet.setFiller(new Runnable() {
            @Override
            public void run() {
                fillWorkspace(sheet);
            }
        });
        final Activity host = sheet.host;
        final Harness.State state = Harness.state();
        sheet.reset(host.getString(R.string.harness_workspace_panel_title), null);
        if (state != null && !state.writeConfig) {
            sheet.note(host.getString(R.string.harness_readonly_warning));
        }
        sheet.group(host.getString(R.string.harness_recent_workspaces));
        if (state == null || state.spaces.isEmpty()) {
            // 契约 §3.2 v1.3.3：失败必须可见、可重试——说明 + 原因 + 一行「重新加载」。
            sheet.note(host.getString(R.string.harness_loading));
            String reason = Harness.lastError();
            if (reason == null || reason.length() == 0) {
                reason = host.getString(R.string.harness_empty_workspaces);
            }
            sheet.note(host.getString(R.string.harness_load_error, reason));
            sheet.addRow(sheet.actionRow(R.drawable.ic_refresh,
                    host.getString(R.string.harness_retry), true, new View.OnClickListener() {
                        @Override
                        public void onClick(View view) {
                            sheet.refill();
                            sheet.resize();
                            refreshPanel(sheet);
                        }
                    }, 0));
        } else {
            for (int index = 0; index < state.spaces.size(); index++) {
                final Harness.Space item = state.spaces.get(index);
                final String label = item.title == null || item.title.length() == 0
                        ? treeName(item.cwd) : item.title;
                sheet.addRow(sheet.contentRow(Harness.workspaceIcon(), label, item.cwd,
                        item.current, true, new View.OnClickListener() {
                            @Override
                            public void onClick(View view) {
                                if (item.current) {
                                    sheet.close();
                                    return;
                                }
                                commit(sheet, "workspace", item.cwd, label);
                            }
                        }));
            }
        }
        final boolean canBrowse = state == null || state.listDirs;
        sheet.addRow(sheet.actionRow(R.drawable.ic_folder,
                host.getString(R.string.harness_browse_dir), canBrowse, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        fillDirBrowser(sheet, sheet.prefs.harnessWorkspace());
                    }
                }, 0));
        sheet.addRow(sheet.actionRow(0, host.getString(R.string.harness_manual_path), true,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        manualPath(sheet);
                    }
                }, sheet.t.dp(24)));
        sheet.resize();
    }

    /** 目录浏览：先画标题与加载行，数据回来后整页重画。 */
    private static void fillDirBrowser(final Sheet sheet, final String path) {
        final Activity host = sheet.host;
        sheet.setFiller(new Runnable() {
            @Override
            public void run() {
                fillDirBrowser(sheet, path);
            }
        });
        sheet.reset(host.getString(R.string.harness_browse_dir), new Runnable() {
            @Override
            public void run() {
                fillWorkspace(sheet);
            }
        });
        sheet.note(host.getString(R.string.harness_loading));
        sheet.resize();
        loadDirs(sheet, path);
    }

    private static void loadDirs(final Sheet sheet, final String path) {
        final Activity host = sheet.host;
        final Prefs prefs = sheet.prefs;
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                JSONObject json = null;
                String error = "";
                try {
                    String query = "/v1/harness/dirs";
                    if (path != null && path.length() > 0) {
                        query = query + "?path=" + android.net.Uri.encode(path, "/\\:");
                    }
                    json = Api.call(prefs.base(), prefs.token(), "GET", query, null);
                } catch (Throwable failure) {
                    error = describe(failure);
                }
                final JSONObject result = json;
                final String failureText = error;
                host.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (!sheet.isOpen()) return;
                        showDirs(sheet, result == null ? path
                                : Harness.dirsCwd(result), result, failureText);
                    }
                });
            }
        }, "harness-dirs");
        worker.setDaemon(true);
        worker.start();
    }

    private static void showDirs(final Sheet sheet, final String cwd, final JSONObject json,
                                 final String error) {
        final Activity host = sheet.host;
        final List<Harness.Dir> entries = Harness.dirs(json);
        final String parent = Harness.dirsParent(json);
        sheet.setFiller(new Runnable() {
            @Override
            public void run() {
                showDirs(sheet, cwd, json, error);
            }
        });
        sheet.reset(host.getString(R.string.harness_browse_dir), new Runnable() {
            @Override
            public void run() {
                fillWorkspace(sheet);
            }
        });
        if (json == null) {
            sheet.note(error.length() > 0 ? error : host.getString(R.string.harness_loading));
            sheet.resize();
            return;
        }
        sheet.addRow(sheet.breadcrumb(cwd, new Sheet.OnPathClick() {
            @Override
            public void onPath(String target) {
                loadDirs(sheet, target);
            }
        }));
        if (parent != null && parent.length() > 0) {
            sheet.addRow(sheet.contentRow(R.drawable.ic_back,
                    host.getString(R.string.harness_parent_dir), parent, false, true,
                    new View.OnClickListener() {
                        @Override
                        public void onClick(View view) {
                            loadDirs(sheet, parent);
                        }
                    }));
        }
        for (int index = 0; index < entries.size(); index++) {
            final Harness.Dir entry = entries.get(index);
            View.OnClickListener tap = null;
            if (entry.dir) {
                tap = new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        loadDirs(sheet, entry.path);
                    }
                };
            }
            sheet.addRow(sheet.contentRow(entry.dir ? R.drawable.ic_folder : R.drawable.ic_doc,
                    entry.name, null, false, entry.dir, tap));
        }
        sheet.addRow(sheet.actionRow(R.drawable.ic_check,
                host.getString(R.string.harness_use_this_dir), true, new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        commit(sheet, "workspace", cwd, treeName(cwd));
                    }
                }, 0));
        sheet.addRow(sheet.actionRow(0, host.getString(R.string.harness_manual_path), true,
                new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        manualPath(sheet);
                    }
                }, sheet.t.dp(24)));
        sheet.resize();
    }

    /* ---------------- Agent 预设面板 ---------------- */

    private static void fillPreset(final Sheet sheet) {
        sheet.setFiller(new Runnable() {
            @Override
            public void run() {
                fillPreset(sheet);
            }
        });
        final Activity host = sheet.host;
        final Harness.State state = Harness.state();
        sheet.reset(host.getString(R.string.harness_preset_panel_title), null);
        sheet.note(host.getString(R.string.harness_preset_section_intro));
        if (state != null && !state.writeConfig) {
            sheet.note(host.getString(R.string.harness_readonly_warning));
        }
        if (state == null || state.presets.isEmpty()) {
            // 契约 §3.2 v1.3.3：名册拿不到时不能只留一句空话——说明 + 原因 + 一行「重新加载」。
            sheet.note(host.getString(R.string.harness_loading));
            String reason = Harness.lastError();
            if (reason == null || reason.length() == 0) {
                reason = host.getString(R.string.harness_empty_presets);
            }
            sheet.note(host.getString(R.string.harness_load_error, reason));
            sheet.addRow(sheet.actionRow(R.drawable.ic_refresh,
                    host.getString(R.string.harness_retry), true, new View.OnClickListener() {
                        @Override
                        public void onClick(View view) {
                            sheet.refill();
                            sheet.resize();
                            refreshPanel(sheet);
                        }
                    }, 0));
        } else {
            // 契约 §3.2 v1.3.3 修订：不做「主机提示」分组（State 无 failures 字段，逐条 reason 已足够）。
            renderPresetGroup(sheet, state, true);
            renderPresetGroup(sheet, state, false);
        }
        sheet.resize();
    }

    private static void renderPresetGroup(final Sheet sheet, final Harness.State state,
                                          boolean builtin) {
        final Activity host = sheet.host;
        List<Harness.Preset> group = new ArrayList<Harness.Preset>();
        for (int index = 0; index < state.presets.size(); index++) {
            Harness.Preset item = state.presets.get(index);
            if (item.builtin == builtin) group.add(item);
        }
        if (group.isEmpty()) return;
        sheet.group(host.getString(builtin
                ? R.string.harness_group_builtin : R.string.harness_group_custom));
        for (int index = 0; index < group.size(); index++) {
            final Harness.Preset preset = group.get(index);
            View.OnClickListener tap = null;
            if (preset.usable) {
                tap = new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        if (preset.current) {
                            sheet.close();
                            return;
                        }
                        commit(sheet, "agentPreset", preset.id, preset.title);
                    }
                };
            }
            sheet.addRow(presetRow(sheet, preset, tap));
        }
    }

    /** 一项预设：名称 13sp + 描述 12sp（最多 3 行省略）；不可用的置灰且不可点，并追加原因。 */
    private static LinearLayout presetRow(final Sheet sheet, final Harness.Preset preset,
                                          View.OnClickListener onTap) {
        final Activity host = sheet.host;
        final Theme t = sheet.t;
        boolean enabled = preset.usable;
        String title = preset.title == null || preset.title.length() == 0
                ? preset.id : preset.title;

        LinearLayout cell = t.column();
        cell.setPadding(t.dp(16), t.dp(9), t.dp(16), t.dp(9));
        cell.setBackground(t.ripple(12f));

        LinearLayout line = t.row();
        TextView name = t.text(title, 13f,
                enabled ? (preset.current ? t.accent : t.text) : t.muted2);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        line.addView(name, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        if (!enabled) {
            TextView broken = t.text(host.getString(R.string.harness_broken_badge), 10.5f, t.warn);
            broken.setPadding(t.dp(6), t.dp(1), t.dp(6), t.dp(1));
            broken.setBackground(t.pill(Theme.alpha(t.warn, 0.14f)));
            LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            badgeLp.leftMargin = t.dp(6);
            line.addView(broken, badgeLp);
        }
        if (preset.current) {
            TextView inUse = t.text(host.getString(R.string.harness_in_use), 10.5f, t.accent);
            inUse.setPadding(t.dp(6), t.dp(1), t.dp(6), t.dp(1));
            inUse.setBackground(t.pill(Theme.alpha(t.accent, 0.12f)));
            LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            badgeLp.leftMargin = t.dp(6);
            line.addView(inUse, badgeLp);
        }
        cell.addView(line, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        String description = preset.description == null ? "" : preset.description;
        if (description.length() == 0) description = host.getString(R.string.harness_no_description);
        TextView desc = t.text(description, 12f, enabled ? t.muted2 : Theme.alpha(t.muted2, 0.7f));
        desc.setMaxLines(3);
        desc.setEllipsize(TextUtils.TruncateAt.END);
        desc.setLineSpacing(t.dp(2), 1f);
        LinearLayout.LayoutParams descLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        descLp.topMargin = t.dp(3);
        cell.addView(desc, descLp);

        if (!enabled && preset.reason != null && preset.reason.length() > 0) {
            TextView reason = t.text(preset.reason, 12f, t.warn);
            reason.setMaxLines(2);
            reason.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams reasonLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            reasonLp.topMargin = t.dp(3);
            cell.addView(reason, reasonLp);
        }

        if (enabled && onTap != null) {
            cell.setClickable(true);
            cell.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    if (sheet.busy) return;
                    onTap.onClick(view);
                }
            });
        } else {
            cell.setAlpha(0.72f);
        }
        return cell;
    }

    /** 手动输入绝对路径。 */
    private static void manualPath(final Sheet sheet) {
        final Activity host = sheet.host;
        final Theme t = sheet.t;
        final Prefs prefs = sheet.prefs;
        final Dialog dialog = new Dialog(host);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(t.dp(20), t.dp(18), t.dp(20), t.dp(12));

        TextView title = t.strong(host.getString(R.string.harness_manual_path), 15f, t.text);
        card.addView(title);

        final EditText input = new EditText(host);
        input.setSingleLine(true);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        input.setTextColor(t.text);
        input.setHintTextColor(t.muted2);
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        String seed = prefs.harnessWorkspace();
        if (seed == null) seed = "";
        input.setText(seed);
        input.setSelection(input.getText().length());
        input.setBackground(t.roundStroke(t.dark ? t.surfaceAlt : t.surfaceAlt, t.line, 10f));
        input.setPadding(t.dp(10), t.dp(9), t.dp(10), t.dp(9));
        LinearLayout.LayoutParams inputLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        inputLp.topMargin = t.dp(12);
        card.addView(input, inputLp);

        LinearLayout buttons = t.row();
        buttons.setGravity(Gravity.END);
        LinearLayout.LayoutParams buttonsLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonsLp.topMargin = t.dp(10);
        card.addView(buttons, buttonsLp);

        TextView cancel = t.text(host.getString(R.string.cancel), 14f, t.muted);
        cancel.setPadding(t.dp(12), t.dp(10), t.dp(12), t.dp(10));
        cancel.setBackground(t.ripple(10f));
        cancel.setClickable(true);
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });
        buttons.addView(cancel);

        TextView use = t.strong(host.getString(R.string.harness_use_this_dir), 14f, t.accent);
        use.setPadding(t.dp(12), t.dp(10), t.dp(12), t.dp(10));
        use.setBackground(t.ripple(10f));
        use.setClickable(true);
        use.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                String value = input.getText().toString().trim();
                if (value.length() == 0) return;
                dialog.dismiss();
                commit(sheet, "workspace", value, treeName(value));
            }
        });
        buttons.addView(use);

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
    }

    /* ---------------- 乐观更新 ---------------- */

    /**
     * 点选 = 乐观更新：先关面板、先把 chip 文案换成新值（缓存也一起改，chip 从缓存渲染），
     * 再后台 POST /v1/harness/config；失败回滚文案并 Toast，persisted=false 追加提示。
     */
    private static void commit(final Sheet sheet, final String key, final String value,
                               final String label) {
        if (sheet.busy) return;
        sheet.busy = true;
        final Prefs prefs = sheet.prefs;
        final Activity host = sheet.host;
        final Runnable onChanged = sheet.onChanged;
        final String oldValue = cachedValue(prefs, key);
        final String oldLabel = cachedLabel(prefs, key);
        sheet.close();
        applyCache(prefs, key, value, label);
        if (onChanged != null) onChanged.run();
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                Harness.Result outcome = null;
                try {
                    outcome = Harness.set(prefs, Harness.body(key, value));
                } catch (Throwable failure) {
                    outcome = null;
                }
                final Harness.Result result = outcome;
                host.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (result == null || !result.ok) {
                            applyCache(prefs, key, oldValue, oldLabel);
                            if (onChanged != null) onChanged.run();
                            String reason = result == null
                                    ? host.getString(R.string.harness_broken_badge) : result.message;
                            Toast.makeText(host, host.getString(R.string.harness_switch_refused,
                                    label, reason), Toast.LENGTH_SHORT).show();
                            return;
                        }
                        if (onChanged != null) onChanged.run();
                        if (!result.persisted) {
                            Toast.makeText(host, host.getString(R.string.harness_persist_runtime_only),
                                    Toast.LENGTH_SHORT).show();
                        }
                    }
                });
            }
        }, "harness-config");
        worker.setDaemon(true);
        worker.start();
    }

    /** 把选中值写进本地快照（chip 与面板都从这里取文案）。 */
    private static void applyCache(Prefs prefs, String key, String value, String label) {
        if (prefs == null) return;
        String safeValue = value == null ? "" : value;
        String safeLabel = label == null ? "" : label;
        if ("workspace".equals(key)) {
            prefs.setHarnessWorkspace(safeValue);
            prefs.setHarnessWorkspaceTitle(safeLabel);
        } else if ("agentPreset".equals(key)) {
            prefs.setHarnessPreset(safeValue);
            prefs.setHarnessPresetTitle(safeLabel);
        }
    }

    private static String cachedValue(Prefs prefs, String key) {
        if (prefs == null) return "";
        return "workspace".equals(key) ? prefs.harnessWorkspace() : prefs.harnessPreset();
    }

    private static String cachedLabel(Prefs prefs, String key) {
        if (prefs == null) return "";
        return "workspace".equals(key) ? prefs.harnessWorkspaceTitle() : prefs.harnessPresetTitle();
    }

    private static String describe(Throwable failure) {
        if (failure == null) return "";
        String message = failure.getMessage();
        if (message != null && message.length() > 0) return message;
        return Api.message(failure);
    }

    /** 路径最后一段（chip 上放不下完整路径）。 */
    private static String treeName(String path) {
        if (path == null) return "";
        String trimmed = path;
        while (trimmed.length() > 1
                && (trimmed.endsWith("/") || trimmed.endsWith("\\"))) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        int cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        if (cut >= 0 && cut + 1 < trimmed.length()) return trimmed.substring(cut + 1);
        return trimmed;
    }

    /** 面包屑的每一段前缀。 */
    private static List<String> pathPrefixes(String cwd) {
        List<String> segments = new ArrayList<String>();
        if (cwd == null || cwd.length() == 0) return segments;
        for (int index = 0; index < cwd.length(); index++) {
            char mark = cwd.charAt(index);
            if (mark != '/' && mark != '\\') continue;
            String prefix = cwd.substring(0, index);
            if (prefix.length() == 0) prefix = cwd.substring(0, index + 1);
            if (prefix.length() > 0) segments.add(prefix);
        }
        String tail = cwd;
        while (tail.length() > 1 && (tail.endsWith("/") || tail.endsWith("\\"))) {
            tail = tail.substring(0, tail.length() - 1);
        }
        if (tail.length() > 0 && (segments.isEmpty() || !tail.equals(segments.get(segments.size() - 1)))) {
            segments.add(tail);
        }
        return segments;
    }

    /**
     * 底部面板外壳：全屏遮罩 + 贴底卡片；返回键 / 点遮罩关闭，内容超高时内部滚动。
     * 视觉沿用本文件既有面板的令牌与行样式（对照 Menu 的 rootRow / itemRow / addRow）。
     */
    private static final class Sheet {

        interface OnPathClick {
            void onPath(String path);
        }

        private final Activity host;
        private final Theme t;
        private final Prefs prefs;
        private final Runnable onChanged;
        private final PopupWindow win;
        private final View scrim;
        private final LinearLayout card;
        private final LinearLayout head;
        private final LinearLayout body;
        private Runnable filler;
        private boolean busy;
        private boolean closed;

        Sheet(final Activity host, final Theme t, final Prefs prefs, final View anchor,
              final Runnable onChanged) {
            this.host = host;
            this.t = t;
            this.prefs = prefs;
            this.onChanged = onChanged;

            LinearLayout root = t.column();
            scrim = new View(host);
            scrim.setBackgroundColor(0x7A000000);
            scrim.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    close();
                }
            });
            root.addView(scrim, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

            card = t.column();
            card.setClickable(true);
            card.setClipChildren(true);
            card.setClipToPadding(true);
            card.setBackground(t.roundStroke(t.dark ? t.surfaceAlt : 0xFFFFFFFF,
                    t.dark ? t.line : 0x1A000000, 18f));
            final int radius = t.dp(18);
            card.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radius);
                }
            });
            card.setClipToOutline(true);

            head = t.column();
            card.addView(head, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));

            body = t.column();
            ScrollView scroll = new ScrollView(host);
            scroll.setClipChildren(true);
            scroll.setClipToPadding(true);
            scroll.setPadding(0, 0, 0, t.dp(8));
            scroll.setVerticalScrollBarEnabled(false);
            scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
            scroll.setBackground(null);
            scroll.addView(body, new ScrollView.LayoutParams(
                    ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
            card.addView(scroll, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

            root.addView(card, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, t.dp(160)));
            root.setFocusableInTouchMode(true);
            root.setOnKeyListener(new View.OnKeyListener() {
                @Override
                public boolean onKey(View view, int code, android.view.KeyEvent event) {
                    if (code == android.view.KeyEvent.KEYCODE_BACK
                            && event.getAction() == android.view.KeyEvent.ACTION_UP
                            && !closed) {
                        close();
                        return true;
                    }
                    return false;
                }
            });

            win = new PopupWindow(root, ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT);
            win.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            win.setFocusable(true);
            win.setOutsideTouchable(false);
            win.setElevation(t.dp(14));
            win.setOnDismissListener(new PopupWindow.OnDismissListener() {
                @Override
                public void onDismiss() {
                    closed = true;
                }
            });
            this.anchor = anchor == null ? card : anchor;
        }

        private final View anchor;

        void show() {
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) card.getLayoutParams();
            lp.height = measureCardHeight();
            card.setLayoutParams(lp);
            // 动效令牌：面板入场位移/时长/曲线由 Motion 统一托管（进场 250ms + cubic-bezier(0,0,0,1)，SPEC §6.1）。
            // 遮罩仍走 1f 目标（底色 0x7A000000 自带 48% 黑，见 :2073），避免与 SCRIM_ALPHA 二次相乘。
            scrim.setAlpha(0f);
            win.showAtLocation(anchor, Gravity.BOTTOM | Gravity.START, 0, 0);
            Motion.sheetIn(card, null, t).start();
            Motion.fadeIn(scrim, Motion.DUR_SHEET_IN).start();
        }

        void close() {
            if (closed || !win.isShowing()) {
                closed = true;
                return;
            }
            closed = true;
            // 退场按进来路径原路退（SPEC §6.2：200ms + cubic-bezier(0.3,0,1,1)）。
            Motion.sheetOutSymmetric(card, null, t, new Runnable() {
                @Override
                public void run() {
                    win.dismiss();
                }
            }).start();
            Motion.fadeOut(scrim, Motion.DUR_SHEET_OUT, null).start();
        }

        void setFiller(Runnable filler) {
            this.filler = filler;
        }

        void refill() {
            if (filler != null) filler.run();
        }

        boolean isOpen() {
            return !closed && win.isShowing();
        }

        /** 内容超出屏幕就内部滚动：卡片高度 = min(自然高度, 屏幕 − 64dp)。 */
        int measureCardHeight() {
            int width = host.getResources().getDisplayMetrics().widthPixels;
            int exact = View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY);
            int free = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
            head.measure(exact, free);
            body.measure(exact, free);
            int content = head.getMeasuredHeight() + body.getMeasuredHeight() + t.dp(8);
            int screen = host.getResources().getDisplayMetrics().heightPixels;
            int cap = screen - t.dp(64);
            return Math.max(t.dp(120), Math.min(content, cap));
        }

        void resize() {
            if (!win.isShowing() || closed) return;
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) card.getLayoutParams();
            lp.height = measureCardHeight();
            card.setLayoutParams(lp);
        }

        /** 清空并重画标题条，返回可写的内容区。 */
        LinearLayout reset(String title, final Runnable back) {
            head.removeAllViews();
            head.setPadding(0, 0, 0, t.dp(2));
            View handle = new View(host);
            handle.setBackground(t.round(t.dark ? t.line : 0xFFE4E6EA, 2f));
            LinearLayout.LayoutParams handleLp = new LinearLayout.LayoutParams(t.dp(36), t.dp(4));
            handleLp.gravity = Gravity.CENTER_HORIZONTAL;
            handleLp.topMargin = t.dp(8);
            head.addView(handle, handleLp);

            LinearLayout row = t.row();
            row.setPadding(t.dp(16), t.dp(8), t.dp(16), t.dp(4));
            if (back != null) {
                ImageView arrow = t.icon(R.drawable.ic_back, t.muted, 15);
                LinearLayout.LayoutParams arrowLp = new LinearLayout.LayoutParams(t.dp(15), t.dp(15));
                arrowLp.rightMargin = t.dp(10);
                arrow.setBackground(t.ripple(10f));
                arrow.setClickable(true);
                arrow.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        back.run();
                    }
                });
                row.addView(arrow, arrowLp);
            }
            TextView label = t.strong(title, 15f, t.text);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            row.addView(label, new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            head.addView(row, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));

            body.removeAllViews();
            return body;
        }

        void addRow(View row) {
            body.addView(row, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));
        }

        /** 分组标题（对照 Menu.groupHeader）。 */
        void group(String title) {
            TextView label = t.text(title, 11f, t.muted2);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            label.setPadding(t.dp(16), t.dp(10), t.dp(16), t.dp(4));
            addRow(label);
        }

        /** 说明行（对照 Menu.note）。 */
        void note(String text) {
            TextView label = t.text(text, 12f, t.muted2);
            label.setLineSpacing(t.dp(2), 1f);
            label.setPadding(t.dp(16), t.dp(4), t.dp(16), t.dp(10));
            addRow(label);
        }

        /** 可选项行：图标 + 名称 + 可选副标题（完整 cwd，过长中间省略）+ 选中打勾。 */
        LinearLayout contentRow(int iconRes, String title, String subtitle, boolean selected,
                                boolean enabled, final View.OnClickListener onTap) {
            LinearLayout cell = t.column();
            cell.setMinimumHeight(t.dp(46));
            cell.setPadding(t.dp(16), t.dp(7), t.dp(16), t.dp(7));
            cell.setBackground(t.ripple(12f));

            LinearLayout line = t.row();
            TextView name = t.text(title, 14f,
                    selected ? t.accent : (enabled ? t.text : t.muted2));
            name.setSingleLine(true);
            name.setEllipsize(TextUtils.TruncateAt.END);
            if (iconRes != 0) {
                line.addView(t.icon(iconRes, selected ? t.accent : t.muted, 15));
                LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(0,
                        LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
                nameLp.leftMargin = t.dp(10);
                line.addView(name, nameLp);
            } else {
                line.addView(name, new LinearLayout.LayoutParams(0,
                        LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            }
            if (selected) {
                ImageView tick = t.icon(R.drawable.ic_check, t.accent, 13);
                LinearLayout.LayoutParams tickLp = new LinearLayout.LayoutParams(t.dp(13), t.dp(13));
                tickLp.leftMargin = t.dp(6);
                line.addView(tick, tickLp);
            }
            cell.addView(line, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));

            if (subtitle != null && subtitle.length() > 0) {
                TextView sub = t.text(subtitle, 12f, t.muted2);
                sub.setSingleLine(true);
                sub.setEllipsize(TextUtils.TruncateAt.MIDDLE);
                LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT);
                subLp.leftMargin = iconRes != 0 ? t.dp(25) : 0;
                subLp.topMargin = t.dp(2);
                cell.addView(sub, subLp);
            }

            if (enabled && onTap != null) {
                cell.setClickable(true);
                cell.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        if (busy) return;
                        onTap.onClick(view);
                    }
                });
            } else if (!enabled) {
                cell.setAlpha(0.55f);
            }
            return cell;
        }

        /** 动作行：强调色文案（对照 Menu.addRow）；iconRes 传 0 时用左内边距对齐。 */
        LinearLayout actionRow(int iconRes, String title, boolean enabled,
                               final View.OnClickListener onTap, int insetPx) {
            LinearLayout cell = t.row();
            cell.setMinimumHeight(t.dp(44));
            cell.setGravity(Gravity.CENTER_VERTICAL);
            cell.setPadding(t.dp(16), t.dp(6), t.dp(16), t.dp(6));
            cell.setBackground(t.ripple(12f));
            if (iconRes != 0) {
                cell.addView(t.icon(iconRes, enabled ? t.accent : t.muted2, 14));
            }
            TextView label = t.strong(title, 13.5f, enabled ? t.accent : t.muted2);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams labelLp = new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            labelLp.leftMargin = iconRes != 0 ? t.dp(10) : insetPx;
            cell.addView(label, labelLp);
            if (enabled && onTap != null) {
                cell.setClickable(true);
                cell.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        if (busy) return;
                        onTap.onClick(view);
                    }
                });
            }
            return cell;
        }

        /** 面包屑：可横向滚动的路径段，点某段回到那一层。 */
        View breadcrumb(final String cwd, final OnPathClick onTap) {
            final HorizontalScrollView scroll = new HorizontalScrollView(host);
            scroll.setHorizontalScrollBarEnabled(false);
            scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
            scroll.setClipToPadding(false);
            scroll.setPadding(t.dp(16), t.dp(4), t.dp(16), t.dp(6));
            LinearLayout row = t.row();
            final List<String> segments = pathPrefixes(cwd);
            for (int index = 0; index < segments.size(); index++) {
                final String segment = segments.get(index);
                if (index > 0) {
                    LinearLayout.LayoutParams chevronLp = new LinearLayout.LayoutParams(
                            t.dp(10), t.dp(10));
                    chevronLp.leftMargin = t.dp(2);
                    chevronLp.rightMargin = t.dp(2);
                    row.addView(t.icon(R.drawable.ic_chevron_right, t.muted2, 10), chevronLp);
                }
                TextView label = t.text(treeName(segment), 12f,
                        index == segments.size() - 1 ? t.text : t.muted2);
                label.setSingleLine(true);
                label.setPadding(t.dp(4), t.dp(2), t.dp(4), t.dp(2));
                label.setBackground(t.ripple(8f));
                label.setClickable(true);
                label.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        onTap.onPath(segment);
                    }
                });
                row.addView(label, new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT));
            }
            scroll.addView(row, new HorizontalScrollView.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT));
            scroll.post(new Runnable() {
                @Override
                public void run() {
                    scroll.fullScroll(View.FOCUS_RIGHT);
                }
            });
            return scroll;
        }
    }
}
