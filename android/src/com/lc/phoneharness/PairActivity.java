package com.lc.phoneharness;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/** 连接电脑：地址 + 6 位配对码。风格与官方 App 的登录页一致（大标题 + 圆角输入 + 主按钮）。 */
public class PairActivity extends Activity {

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
    private EditText address;
    private EditText code;
    private TextView status;
    private TextView connect;
    private TextView probe;
    /** 建界面时的明暗，onResume 用来比对：主题是建界面时算出来的，明暗一变就整体重建。 */
    private boolean darkAtBuild;

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

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(t.bg);
        LinearLayout root = t.column();
        int pad = t.dp(24);
        root.setPadding(pad, t.dp(18), pad, t.dp(28));
        scroll.addView(root);

        android.widget.ImageView mark = new android.widget.ImageView(this);
        mark.setImageResource(t.brandLogo());
        mark.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        mark.setLayoutParams(new LinearLayout.LayoutParams(t.dp(44), t.dp(44)));
        LinearLayout holder = t.column();
        holder.setGravity(Gravity.CENTER_HORIZONTAL);
        holder.addView(mark);
        root.addView(holder);

        TextView title = t.strong(getString(R.string.pr_title), 22f, t.text);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleLp.topMargin = t.dp(16);
        root.addView(title, titleLp);

        TextView hint = t.text(getString(R.string.pr_hint), 12f, t.muted);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintLp.topMargin = t.dp(10);
        root.addView(hint, hintLp);

        root.addView(label(getString(R.string.pr_label_host)));
        address = field(prefs.address(), "192.168.x.x:8737", false);
        root.addView(address);

        root.addView(label(getString(R.string.pr_label_code)));
        code = field("", getString(R.string.pr_hint_code), true);
        root.addView(code);

        connect = t.strong(getString(R.string.pr_connect), 16f, t.onAccent);
        connect.setGravity(Gravity.CENTER);
        connect.setPadding(0, t.dp(14), 0, t.dp(14));
        connect.setBackground(t.rippleOn(t.accent, 26f));
        connect.setClickable(true);
        LinearLayout.LayoutParams connectLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        connectLp.topMargin = t.dp(26);
        root.addView(connect, connectLp);

        probe = t.text(getString(R.string.pr_probe), 13f, t.muted);
        probe.setGravity(Gravity.CENTER);
        probe.setPadding(0, t.dp(14), 0, t.dp(4));
        probe.setClickable(true);
        probe.setBackground(t.ripple(999f));
        root.addView(probe);

        status = t.text("", 12f, t.muted);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusLp.topMargin = t.dp(10);
        root.addView(status, statusLp);

        if (prefs.token().length() > 0) {
            TextView tip = t.text(getString(R.string.pr_tip_has_token, prefs.base()), 11f, t.warn);
            tip.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams tipLp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            tipLp.topMargin = t.dp(14);
            root.addView(tip, tipLp);
        }

        // 常用地址：只从本机「已保存的主机」列表里取，安装包里不硬编码任何地址。
        java.util.List<String[]> presetRows = new java.util.ArrayList<String[]>();
        String current = Prefs.normalize(prefs.address());
        for (Hosts.Entry entry : Hosts.load(prefs)) {
            if (presetRows.size() >= 4) break;
            if (entry.address.length() == 0) continue;
            if (Prefs.normalize(entry.address).equals(current)) continue;
            presetRows.add(new String[] { entry.name.length() > 0 ? entry.name : entry.address, entry.address });
        }
        if (presetRows.size() > 0) {
            root.addView(label(getString(R.string.pr_label_presets)));
            LinearLayout chips = t.row();
            for (String[] preset : presetRows) {
                TextView chip = t.text(preset[0], 12f, t.accent);
                chip.setPadding(t.dp(12), t.dp(7), t.dp(12), t.dp(7));
                chip.setBackground(t.rippleOnStroke(0x00000000, t.line, 16f));
                chip.setClickable(true);
                Theme.margin(chip, 0, 0, t.dp(8), 0);
                final String value = preset[1];
                chip.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View view) {
                        address.setText(value);
                    }
                });
                chips.addView(chip);
            }
            root.addView(chips);
        }

        probe.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                prefs.setAddress(address.getText().toString().trim());
                say(getString(R.string.pr_status_pinging, prefs.base()), t.muted);
                api.get("/v1/ping", new Api.Callback() {
                    @Override
                    public void onOk(JSONObject body) {
                        say(getString(R.string.pr_status_ok, body.optString("name", "?"), body.optString("version", "?")), t.ok);
                    }

                    @Override
                    public void onError(String message) {
                        say(getString(R.string.pr_status_fail, message), t.bad);
                    }
                });
            }
        });

        connect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                prefs.setAddress(address.getText().toString().trim());
                String digits = code.getText().toString().trim();
                if (digits.length() != 6) {
                    say(getString(R.string.pr_err_code_len), t.warn);
                    return;
                }
                JSONObject body = new JSONObject();
                try {
                    body.put("code", digits);
                    body.put("device", deviceName());
                } catch (Exception ignore) {
                }
                say(getString(R.string.pr_status_pairing), t.muted);
                connect.setEnabled(false);
                api.pool().execute(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            JSONObject result = api.request("POST", "/v1/pair", body);
                            prefs.setToken(result.optString("token", ""));
                            prefs.setDevice(deviceName());
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    Toast.makeText(PairActivity.this, getString(R.string.pr_toast_connected), Toast.LENGTH_SHORT).show();
                                    Nav.replace(PairActivity.this,
                                            new Intent(PairActivity.this, MainActivity.class));
                                }
                            });
                        } catch (final Exception error) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    connect.setEnabled(true);
                                    say(getString(R.string.pr_status_pair_fail, Api.message(error)), t.bad);
                                }
                            });
                        }
                    }
                });
            }
        });

        // 顶栏：左上角圆形返回键（此前这一页没有任何返回入口，只能按系统返回键）。
        LinearLayout page = t.column();
        page.setBackgroundColor(t.bg);
        page.addView(topBar());
        page.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(page);
    }

    /** 顶栏：只有左上角一枚圆形返回键；页面标题仍由内容区的大标题承担。 */
    private View topBar() {
        FrameLayout bar = new FrameLayout(this);
        bar.setBackgroundColor(t.bg);
        bar.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, t.dp(52)));

        FrameLayout back = new FrameLayout(this);
        back.setBackground(t.rippleOn(t.dark ? t.surfaceAlt : Theme.alpha(t.text, 0.06f), 999f));
        back.setClickable(true);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                finishWithPop();
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
        return bar;
    }

    @Override
    public void onBackPressed() {
        finishWithPop();
    }

    /** 退出本页：与进入方向对称的右出动画（和设置页、会话页同一套）。 */
    private void finishWithPop() {
        Nav.close(this);
    }

    private String deviceName() {
        String model = android.os.Build.MODEL == null ? "android" : android.os.Build.MODEL;
        return model + " (Android " + android.os.Build.VERSION.RELEASE + ")";
    }

    private TextView label(String text) {
        TextView view = t.text(text, 12f, t.muted);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = t.dp(20);
        lp.bottomMargin = t.dp(8);
        view.setLayoutParams(lp);
        return view;
    }

    private EditText field(String value, String hint, boolean digits) {
        EditText edit = new EditText(this);
        edit.setText(value);
        edit.setHint(hint);
        edit.setHintTextColor(t.muted);
        edit.setTextColor(t.text);
        edit.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15f);
        edit.setSingleLine(true);
        edit.setBackground(t.roundStroke(t.surfaceAlt, t.surfaceAlt, 14f));
        edit.setPadding(t.dp(14), t.dp(13), t.dp(14), t.dp(13));
        if (digits) edit.setInputType(InputType.TYPE_CLASS_NUMBER);
        edit.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return edit;
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 语言在 attach 阶段定死：设置页改过语言后，回到本页要整体重建。
        if (Langs.changed(this, langAtBuild)) {
            recreate();
            return;
        }
        // 设置页可能刚改过「外观」：主题是建界面时算出来的，明暗一变就整体重建。
        if (t != null && Theme.of(this).dark != darkAtBuild) {
            recreate();
        }
    }

    private void say(final String text, final int color) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                status.setText(text);
                status.setTextColor(color);
            }
        });
    }
}
