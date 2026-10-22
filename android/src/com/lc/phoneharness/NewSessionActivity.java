package com.lc.phoneharness;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 新建对话：工作区 + Agent 预设 + 第一句话 + 模型 / 权限。形态照官方 App 的「新对话」页。
 *
 * 原来顶部的裸路径输入框换成了两枚 chip，点开的是电脑端配置面板
 * （docs/harness-contract.md §3.2 / §3.3）：手动输入路径、浏览主机目录都收进工作区面板里，
 * 这样路径只有电脑端一个真相，手机端不再自己存一份工作区配置。
 */
public class NewSessionActivity extends Activity {

    /** attach 阶段定下的语言：onResume 用它判断界面是否需要重建（与主题的 darkAtBuild 同一套做法）。 */
    private String langAtBuild;

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Langs.wrap(base));
        langAtBuild = Langs.current(base);
    }

    private Prefs prefs;
    private Api api;
    private Theme t;

    private EditText first;
    private TextView submit;
    private LinearLayout workspaceChip;
    private LinearLayout presetChip;
    private TextView workspaceLabel;
    private TextView presetLabel;
    private LinearLayout modelRow;
    private LinearLayout permissionRow;

    private final java.util.List<String> modelIds = new java.util.ArrayList<String>();
    private final java.util.List<String> modelNames = new java.util.ArrayList<String>();
    private final java.util.List<String> permissionIds = new java.util.ArrayList<String>();
    private final java.util.List<String> permissionNames = new java.util.ArrayList<String>();
    private int modelIndex = 0;
    private int permissionIndex = 0;

    /** 会话创建时用的工作目录：默认取电脑端当前工作区，用户在工作区面板选过之后就不再被刷新覆盖。 */
    private String workspaceCwd = "";
    private boolean workspacePicked = false;
    /** 会话创建时带的 Agent 预设 id（host 已支持 agentPreset 字段）。 */
    private String presetId = "";

    @Override
    protected void onResume() {
        super.onResume();
        // 语言在 attach 阶段定死：设置页改过语言后，回到本页要整体重建。
        if (Langs.changed(this, langAtBuild)) {
            recreate();
            return;
        }
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = new Prefs(this);
        api = new Api(prefs);
        t = Theme.of(this);
        getWindow().setStatusBarColor(t.bg);
        getWindow().setNavigationBarColor(t.bg);
        getWindow().getDecorView().setSystemUiVisibility(
                t.dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(t.bg);
        LinearLayout root = t.column();
        int pad = t.dp(22);
        root.setPadding(pad, t.dp(26), pad, t.dp(30));
        scroll.addView(root);

        LinearLayout bar = t.row();
        TextView close = t.text(getString(R.string.cancel), 14f, t.muted);
        close.setPadding(t.dp(4), t.dp(6), t.dp(10), t.dp(6));
        close.setClickable(true);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Nav.close(NewSessionActivity.this);
            }
        });
        bar.addView(close);
        bar.addView(t.strong(getString(R.string.session_init_title), 16f, t.text),
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(bar);

        first = new EditText(this);
        first.setHint(getString(R.string.new_session_input_hint));
        first.setHintTextColor(t.muted);
        first.setTextColor(t.text);
        first.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 16f);
        first.setBackgroundColor(0x00000000);
        first.setSingleLine(false);
        first.setMinLines(3);
        first.setGravity(Gravity.TOP);
        first.setPadding(0, t.dp(14), 0, t.dp(10));
        root.addView(first);

        // 座位行：工作区 → 预设（顺序与首页 composer、桌面版 hero 一致）。
        LinearLayout seats = t.row();
        LinearLayout.LayoutParams seatsLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        seatsLp.topMargin = t.dp(14);
        root.addView(seats, seatsLp);

        workspaceChip = seatChip(Harness.workspaceIcon(), 84, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showWorkspacePanel(NewSessionActivity.this, t, prefs, workspaceChip, new Runnable() {
                    @Override
                    public void run() {
                        workspacePicked = true;
                        renderSeats();
                    }
                });
            }
        });
        workspaceLabel = (TextView) workspaceChip.getChildAt(1);
        seats.addView(workspaceChip);

        presetChip = seatChip(Harness.presetIcon(), 56, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Seats.showPresetPanel(NewSessionActivity.this, t, prefs, presetChip, new Runnable() {
                    @Override
                    public void run() {
                        renderSeats();
                    }
                });
            }
        });
        presetLabel = (TextView) presetChip.getChildAt(1);
        LinearLayout.LayoutParams presetLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30));
        presetLp.leftMargin = t.dp(8);
        seats.addView(presetChip, presetLp);

        TextView hint = t.text(getString(R.string.new_session_workspace_hint), 11f, t.muted);
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintLp.topMargin = t.dp(8);
        root.addView(hint, hintLp);

        root.addView(label(getString(R.string.seat_model)));
        modelRow = t.row();
        root.addView(modelRow);

        root.addView(label(getString(R.string.new_session_permission_label)));
        permissionRow = t.row();
        root.addView(permissionRow);

        submit = t.strong(getString(R.string.new_session_submit), 16f, t.onAccent);
        submit.setGravity(Gravity.CENTER);
        submit.setPadding(0, t.dp(14), 0, t.dp(14));
        submit.setBackground(t.rippleOn(t.accent, 26f));
        submit.setClickable(true);
        LinearLayout.LayoutParams submitLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        submitLp.topMargin = t.dp(28);
        root.addView(submit, submitLp);

        submit.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                create();
            }
        });

        // 首帧只用缓存把 chip 画出来，随后静默刷新电脑端配置（不阻塞这一页）。
        renderSeats();
        setContentView(scroll);
        loadCatalog();
        Harness.refresh(this, prefs, new Runnable() {
            @Override
            public void run() {
                renderSeats();
            }
        });
    }

    /** 两枚座位 chip 的文案：电脑端当前值 → Prefs 缓存 → 默认文案。 */
    private void renderSeats() {
        Harness.State state = Harness.state();

        String spaceName = state == null ? "" : state.workspaceTitle();
        if (spaceName.length() == 0) spaceName = prefs.harnessWorkspaceTitle();
        if (spaceName.length() == 0) spaceName = getString(R.string.harness_workspace_chip_default);
        workspaceLabel.setText(spaceName);

        String id = "";
        String name = "";
        if (state != null) {
            id = state.agentPreset == null ? "" : state.agentPreset;
            if (id.length() > 0) name = state.presetTitle(id);
        }
        if (id.length() == 0) {
            id = prefs.harnessPreset();
            name = prefs.harnessPresetTitle();
        } else if (name.equals(id)) {
            // 电脑端只回了 id（没带中文名）时，用上次缓存的中文名兜一下。
            name = id.equals(prefs.harnessPreset()) ? prefs.harnessPresetTitle() : "";
            if (name.length() == 0) name = id;
        }
        presetId = id;
        presetLabel.setText(name.length() == 0 ? getString(R.string.harness_preset_chip_default) : name);

        if (!workspacePicked) {
            String dir = state == null || state.workspace == null ? "" : state.workspace;
            if (dir.length() == 0) dir = prefs.harnessWorkspace();
            if (dir.length() == 0) dir = prefs.workspaceCwd();
            if (dir.length() > 0) workspaceCwd = dir;
        }
    }

    /** composer 上的座位 chip：图标 + 文案 + chevronDown（与首页座位行同款）。 */
    private LinearLayout seatChip(int iconRes, int maxTextDp, View.OnClickListener click) {
        LinearLayout box = t.row();
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, t.dp(30)));
        box.setPadding(t.dp(9), 0, t.dp(6), 0);
        box.setBackground(t.rippleOnStroke(t.cardFill, t.line, 15f));
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

    private void loadCatalog() {
        api.get("/v1/catalog", new Api.Callback() {
            @Override
            public void onOk(final JSONObject body) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        apply(body);
                    }
                });
            }

            @Override
            public void onError(final String message) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(NewSessionActivity.this,
                                getString(R.string.new_session_catalog_failed), Toast.LENGTH_SHORT).show();
                    }
                });
            }
        });
    }

    private void apply(JSONObject body) {
        // 官方 App 的模型选择只有「快速模式 / 专家模式 / 识图模式」三档，
        // 这里把宿主报上来的 model 按 flash/pro 归成两档，避免把 4 个原始 id 堆在一行。
        modelIds.clear();
        modelNames.clear();
        JSONArray models = body.optJSONArray("models");
        if (models != null) {
            String flash = "";
            String pro = "";
            for (int index = 0; index < models.length(); index++) {
                JSONObject entry = models.optJSONObject(index);
                if (entry == null) continue;
                String id = entry.optString("id", "");
                String title = entry.optString("title", id);
                boolean isPro = id.toLowerCase().contains("pro");
                if (isPro) {
                    if (pro.length() == 0 || id.startsWith("deepseek-account/")) { pro = id; }
                } else if (id.toLowerCase().contains("flash")) {
                    if (flash.length() == 0 || id.startsWith("deepseek-account/")) { flash = id; }
                }
                title = title;
            }
            if (flash.length() > 0) { modelIds.add(flash); modelNames.add(getString(R.string.default_model_name)); }
            if (pro.length() > 0) { modelIds.add(pro); modelNames.add(getString(R.string.expert_model_name)); }
        }
        permissionIds.clear();
        permissionNames.clear();
        JSONArray permissions = body.optJSONArray("permissions");
        if (permissions != null) {
            for (int index = 0; index < permissions.length(); index++) {
                JSONObject entry = permissions.optJSONObject(index);
                if (entry == null) continue;
                permissionIds.add(entry.optString("id", ""));
                permissionNames.add(entry.optString("name", entry.optString("id", "")));
            }
        }

        JSONObject defaults = body.optJSONObject("defaults");
        String defaultModel = defaults == null ? "" : defaults.optString("model", "");
        String defaultPermission = defaults == null ? "" : defaults.optString("permission", "");
        modelIndex = Math.max(0, modelIds.indexOf(defaultModel));
        permissionIndex = Math.max(0, permissionIds.indexOf(defaultPermission));

        modelRow.removeAllViews();
        for (int index = 0; index < modelNames.size(); index++) {
            modelRow.addView(choice(modelNames.get(index), index == modelIndex, true, index));
        }
        permissionRow.removeAllViews();
        for (int index = 0; index < permissionNames.size(); index++) {
            permissionRow.addView(choice(permissionNames.get(index), index == permissionIndex, false, index));
        }
    }

    private TextView choice(String label, boolean selected, final boolean isModel, final int slot) {
        TextView chip = t.text(label, 12f, selected ? t.onAccent : t.text);
        chip.setMaxLines(1);
        chip.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        chip.setPadding(t.dp(14), t.dp(9), t.dp(14), t.dp(9));
        chip.setBackground(t.rippleOn(selected ? t.accent : t.surfaceAlt, 18f));
        chip.setClickable(true);
        Theme.margin(chip, 0, t.dp(6), t.dp(8), t.dp(6));
        chip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (isModel) {
                    modelIndex = slot;
                    modelRow.removeAllViews();
                    for (int index = 0; index < modelNames.size(); index++) {
                        modelRow.addView(choice(modelNames.get(index), index == modelIndex, true, index));
                    }
                } else {
                    permissionIndex = slot;
                    permissionRow.removeAllViews();
                    for (int index = 0; index < permissionNames.size(); index++) {
                        permissionRow.addView(choice(permissionNames.get(index), index == permissionIndex, false, index));
                    }
                }
            }
        });
        return chip;
    }

    private void create() {
        String text = first.getText().toString().trim();
        if (text.length() == 0) {
            Toast.makeText(this, getString(R.string.new_session_need_text), Toast.LENGTH_SHORT).show();
            return;
        }
        String directory = workspaceCwd == null ? "" : workspaceCwd.trim();
        if (directory.length() == 0 && Harness.state() != null && Harness.state().workspace != null) {
            directory = Harness.state().workspace.trim();
        }
        if (directory.length() == 0) {
            Toast.makeText(this, getString(R.string.new_session_need_workspace), Toast.LENGTH_SHORT).show();
            return;
        }
        JSONObject body = new JSONObject();
        try {
            body.put("cwd", directory);
            body.put("text", text);
            body.put("requestId", "android-new-" + System.currentTimeMillis());
            if (!modelIds.isEmpty()) body.put("model", modelIds.get(modelIndex));
            if (!permissionIds.isEmpty()) body.put("permission", permissionIds.get(permissionIndex));
            // 新任务用哪套 Agent 预设：电脑端当前值（或上次缓存的）。
            String preset = presetId.length() > 0 ? presetId : prefs.harnessPreset();
            if (preset.length() > 0) body.put("agentPreset", preset);
        } catch (Exception ignore) {
        }
        submit.setEnabled(false);
        submit.setText(getString(R.string.new_session_creating));
        api.post("/v1/sessions", body, new Api.Callback() {
            @Override
            public void onOk(final JSONObject result) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        submit.setEnabled(true);
                        submit.setText(getString(R.string.new_session_submit));
                        String id = result.optString("sessionId", "");
                        if (id.length() == 0) {
                            Toast.makeText(NewSessionActivity.this,
                                    getString(R.string.new_session_no_session_id), Toast.LENGTH_SHORT).show();
                            return;
                        }
                        Intent intent = new Intent(NewSessionActivity.this, ChatActivity.class);
                        intent.putExtra("sessionId", id);
                        intent.putExtra("title", first.getText().toString().trim());
                        Nav.replace(NewSessionActivity.this, intent);
                    }
                });
            }

            @Override
            public void onError(final String message) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        submit.setEnabled(true);
                        submit.setText(getString(R.string.new_session_submit));
                        Toast.makeText(NewSessionActivity.this,
                                getString(R.string.new_session_create_failed, message), Toast.LENGTH_LONG).show();
                    }
                });
            }
        });
    }

    private TextView label(String text) {
        TextView view = t.text(text, 12f, t.muted);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = t.dp(18);
        lp.bottomMargin = t.dp(4);
        view.setLayoutParams(lp);
        return view;
    }
}
