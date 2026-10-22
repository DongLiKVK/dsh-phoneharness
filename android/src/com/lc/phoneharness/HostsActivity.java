package com.lc.phoneharness;

import android.app.Activity;
import android.content.Context;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 在线主机：一台手机同时管多台电脑上的 harness。
 *
 * 列表里每台主机都开着一条 /v1/ping 探测（并发），在线/离线直接标在行上；
 * 点一台就把它变成「当前主机」，工作台（首页会话列表）与归纳箱（归档箱）都切到这台的数据。
 * 这是原来设置页「数据管理」那一行的位置。
 */
public class HostsActivity extends Activity {

    /** attach 阶段定下的语言：onResume 用它判断界面是否需要重建（与主题的 darkAtBuild 同一套做法）。 */
    private String langAtBuild;

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Langs.wrap(base));
        langAtBuild = Langs.current(base);
    }

    private Prefs prefs;
    private Theme t;
    private final List<Hosts.Entry> entries = new ArrayList<Hosts.Entry>();

    private LinearLayout body;
    private TextView header;   // 顶栏右侧的「检测中…」提示
    private boolean probing;
    private int probeSeq;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        prefs = new Prefs(this);
        t = Theme.of(this);
        getWindow().setStatusBarColor(t.bg);
        getWindow().setNavigationBarColor(t.bg);
        getWindow().getDecorView().setSystemUiVisibility(
                t.dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        // 老版本只有一台主机：第一次进来把它补进列表。
        Hosts.adopt(prefs);

        setContentView(build());
        probeAll();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 语言在 attach 阶段定死：设置页改过语言后，回到本页要整体重建。
        if (Langs.changed(this, langAtBuild)) {
            recreate();
            return;
        }
        if (prefs != null && Theme.of(this).dark != t.dark) {
            recreate();
            return;
        }
        if (!probing) probeAll();
    }

    /* ================================================================== */
    /* 骨架                                                               */
    /* ================================================================== */

    private View build() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(t.bg);

        LinearLayout page = t.column();
        page.setBackgroundColor(t.bg);
        root.addView(page, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        page.addView(topBar());

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        body = t.column();
        body.setPadding(0, t.dp(4), 0, t.dp(24));
        scroll.addView(body, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        page.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        page.addView(addBar());
        return root;
    }

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
                Nav.close(HostsActivity.this);
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

        TextView label = t.strong(getString(R.string.hs_title), 17f, t.text);
        label.setGravity(Gravity.CENTER);
        bar.addView(label, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        header = t.text("", 12f, t.muted);
        header.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams headLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT);
        headLp.gravity = Gravity.CENTER_VERTICAL | Gravity.END;
        headLp.rightMargin = t.dp(52);
        bar.addView(header, headLp);

        FrameLayout refresh = new FrameLayout(this);
        refresh.setBackground(t.rippleOn(t.dark ? t.surfaceAlt : Theme.alpha(t.text, 0.06f), 999f));
        refresh.setClickable(true);
        refresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                probeAll();
            }
        });
        ImageView refreshIcon = new ImageView(this);
        refreshIcon.setImageResource(R.drawable.ic_refresh);
        refreshIcon.setColorFilter(t.muted);
        refresh.addView(refreshIcon, new FrameLayout.LayoutParams(t.dp(19), t.dp(19), Gravity.CENTER));
        FrameLayout.LayoutParams refreshLp = new FrameLayout.LayoutParams(t.dp(36), t.dp(36));
        refreshLp.gravity = Gravity.CENTER_VERTICAL | Gravity.END;
        refreshLp.rightMargin = t.dp(8);
        bar.addView(refresh, refreshLp);

        return bar;
    }

    private View addBar() {
        LinearLayout bar = t.column();
        bar.setBackgroundColor(t.bg);
        bar.setPadding(t.dp(16), t.dp(8), t.dp(16), t.dp(16));

        TextView add = t.strong(getString(R.string.hs_add), 15f, t.accent);
        add.setGravity(Gravity.CENTER);
        add.setPadding(0, t.dp(14), 0, t.dp(14));
        add.setBackground(t.rippleOn(t.dark ? t.surfaceAlt : Theme.alpha(t.accent, 0.10f), 26f));
        add.setClickable(true);
        add.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                addDialog();
            }
        });
        bar.addView(add, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return bar;
    }

    /* ================================================================== */
    /* 列表                                                               */
    /* ================================================================== */

    private void probeAll() {
        entries.clear();
        entries.addAll(Hosts.load(prefs));
        final String activeId = Hosts.activeId(prefs);
        if (entries.isEmpty()) {
            probing = false;
            render(activeId);
            return;
        }
        probing = true;
        probeSeq++;
        final int seq = probeSeq;
        for (Hosts.Entry entry : entries) entry.state = Hosts.STATE_PROBING;
        render(activeId);

        for (final Hosts.Entry entry : entries) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    long started = System.currentTimeMillis();
                    String error = "";
                    JSONObject pong = null;
                    try {
                        pong = Api.call(entry.address, entry.token, "GET", "/v1/ping", null);
                    } catch (Exception problem) {
                        error = Api.message(problem);
                    }
                    long cost = System.currentTimeMillis() - started;
                    synchronized (HostsActivity.this) {
                        if (seq != probeSeq) return;
                        entry.latency = cost;
                        if (pong != null) {
                            entry.state = Hosts.STATE_ONLINE;
                            entry.remoteName = pong.optString("name", "");
                            entry.version = pong.optString("version", "");
                            // 用户没起名字时，用电脑自报的名字兜底，这样抽屉/设置页都能看出连的是哪台。
                            if (entry.name.length() == 0 && entry.remoteName.length() > 0) {
                                entry.name = entry.remoteName;
                            }
                            entry.error = "";
                        } else {
                            entry.state = Hosts.STATE_OFFLINE;
                            entry.error = error;
                        }
                    }
                    Hosts.store(prefs, entries);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isFinishing() || seq != probeSeq) return;
                            boolean done = true;
                            for (Hosts.Entry row : entries) {
                                if (row.state == Hosts.STATE_PROBING) {
                                    done = false;
                                    break;
                                }
                            }
                            probing = !done;
                            render(Hosts.activeId(prefs));
                        }
                    });
                }
            }).start();
        }
    }

    private void render(final String activeId) {
        if (body == null) return;
        int alive = 0;
        for (Hosts.Entry entry : entries) if (entry.state == Hosts.STATE_ONLINE) alive++;
        final int online = alive;

        if (header != null) {
            header.setText(probing ? getString(R.string.hs_header_probing)
                    : (entries.isEmpty() ? "" : getString(R.string.hs_header_online, online, entries.size())));
            header.setTextColor(probing ? t.muted : (online > 0 ? t.ok : t.bad));
        }

        body.removeAllViews();

        TextView hint = t.text(entries.isEmpty()
                ? getString(R.string.hs_hint_empty)
                : getString(R.string.hs_hint_list), 12.5f, t.muted);
        hint.setPadding(t.dp(28), t.dp(8), t.dp(28), t.dp(10));
        body.addView(hint, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        if (entries.isEmpty()) return;

        LinearLayout onlineCard = group(getString(R.string.hs_group_online, online));
        int onlineRows = 0;
        for (Hosts.Entry entry : entries) {
            if (entry.state != Hosts.STATE_ONLINE) continue;
            onlineCard.addView(rowView(entry, entry.id.equals(activeId)));
            onlineRows++;
        }
        if (onlineRows == 0) onlineCard.addView(emptyHint(getString(R.string.hs_group_online_empty)));

        int others = entries.size() - online;
        if (others > 0) {
            LinearLayout otherCard = group(getString(R.string.hs_group_others, others));
            for (Hosts.Entry entry : entries) {
                if (entry.state == Hosts.STATE_ONLINE) continue;
                otherCard.addView(rowView(entry, entry.id.equals(activeId)));
            }
        }

        TextView foot = t.text(getString(R.string.hs_foot),
                11.5f, t.muted2);
        foot.setPadding(t.dp(28), t.dp(16), t.dp(28), t.dp(8));
        body.addView(foot, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    /** 行标题：自定义名称 → 电脑自报的名字（ping） → 地址。 */
    private String displayTitle(Hosts.Entry entry) {
        return Hosts.title(entry);
    }

    private String shortAddress(String address) {
        return Hosts.shortOf(address);
    }

    private View emptyHint(String text) {
        TextView view = t.text(text, 14f, t.muted);
        view.setGravity(Gravity.CENTER);
        view.setPadding(t.dp(16), t.dp(18), t.dp(16), t.dp(18));
        return view;
    }

    private LinearLayout group(String title) {
        if (body.getChildCount() > 1) body.addView(gap(t.dp(6)));
        if (title != null && title.length() > 0) {
            TextView head = t.text(title, 13f, t.muted);
            head.setPadding(t.dp(28), t.dp(14), t.dp(28), t.dp(8));
            body.addView(head, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 14f));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.leftMargin = t.dp(12);
        cardLp.rightMargin = t.dp(12);
        body.addView(card, cardLp);
        return card;
    }

    private View gap(int height) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, height));
        return view;
    }

    private View rowView(final Hosts.Entry entry, final boolean active) {
        LinearLayout cell = t.row();
        cell.setGravity(Gravity.CENTER_VERTICAL);
        cell.setPadding(t.dp(16), t.dp(12), t.dp(14), t.dp(12));
        if (active) {
            // 「当前」这一栏只做状态展示：不注册点击、不跳页、不发任何请求，
            // 连按下反馈（ripple）也去掉，避免误触时产生任何响应。
            // 长按仍可打开这台主机自己的管理菜单（改名 / 归纳箱 / 删除）。
            cell.setBackground(null);
            cell.setClickable(false);
        } else {
            cell.setBackground(t.ripple(12f));
            cell.setClickable(true);
            cell.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    switchTo(entry, false);
                }
            });
        }
        cell.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View view) {
                entryMenu(entry);
                return true;
            }
        });

        FrameLayout badge = new FrameLayout(this);
        badge.setBackground(t.circle(active ? Theme.alpha(t.accent, t.dark ? 0.22f : 0.12f) : t.surfaceAlt));
        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_host);
        mark.setColorFilter(active ? t.accent : t.muted);
        badge.addView(mark, new FrameLayout.LayoutParams(t.dp(19), t.dp(19), Gravity.CENTER));
        cell.addView(badge, new LinearLayout.LayoutParams(t.dp(38), t.dp(38)));

        LinearLayout textBox = t.column();
        LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        textLp.leftMargin = t.dp(12);
        cell.addView(textBox, textLp);

        LinearLayout titleRow = t.row();
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView name = t.text(displayTitle(entry), 15f, t.text);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        titleRow.addView(name);
        if (active) {
            TextView tag = t.text(getString(R.string.hs_tag_active), 10.5f, t.accent);
            tag.setPadding(t.dp(6), t.dp(1), t.dp(6), t.dp(1));
            tag.setBackground(t.round(Theme.alpha(t.accent, t.dark ? 0.24f : 0.12f), 6f));
            Theme.margin(tag, t.dp(8), 0, 0, 0);
            titleRow.addView(tag);
        }
        textBox.addView(titleRow);

        String sub = shortAddress(entry.address);
        if (entry.state == Hosts.STATE_ONLINE) {
            if (entry.latency > 0) sub = sub + " · " + entry.latency + " ms";
        } else if (entry.state == Hosts.STATE_PROBING) {
            sub = getString(R.string.hs_sub_probing, sub);
        } else if (entry.state == Hosts.STATE_OFFLINE) {
            sub = getString(R.string.hs_sub_offline, sub);
        }
        TextView detail = t.text(sub, 12f, t.muted);
        detail.setSingleLine(true);
        detail.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        Theme.margin(detail, 0, t.dp(3), 0, 0);
        textBox.addView(detail);

        View dot = new View(this);
        int dotColor = entry.state == Hosts.STATE_ONLINE ? t.ok
                : (entry.state == Hosts.STATE_PROBING ? t.warn : t.bad);
        dot.setBackground(t.circle(dotColor));
        cell.addView(dot, new LinearLayout.LayoutParams(t.dp(8), t.dp(8)));

        if (!active) {
            // 「当前」这一栏没有可跳转的目标，右侧不再显示展开指示符。
            ImageView chevron = new ImageView(this);
            chevron.setImageResource(R.drawable.ic_chevron_right);
            chevron.setColorFilter(t.muted2);
            LinearLayout.LayoutParams chevronLp = new LinearLayout.LayoutParams(t.dp(16), t.dp(16));
            chevronLp.leftMargin = t.dp(8);
            cell.addView(chevron, chevronLp);
        }

        return cell;
    }

    /* ================================================================== */
    /* 切换 / 菜单                                                        */
    /* ================================================================== */

    private void switchTo(Hosts.Entry entry, final boolean archive) {
        if (entry.state == Hosts.STATE_OFFLINE) {
            toast(getString(R.string.hs_toast_offline, displayTitle(entry)));
            return;
        }
        Hosts.activate(prefs, entry.id);
        // 换主机=换一整套界面状态（工作区、归档态、抽屉缓存都得重来），
        // 所以直接把 MainActivity 清到栈顶重建，而不是指望它自己发现宿主变了。
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (archive) intent.putExtra("archive", true);
        Nav.replace(this, intent);
    }

    private void entryMenu(final Hosts.Entry entry) {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(0, t.dp(6), 0, t.dp(8));

        TextView head = t.strong(displayTitle(entry), 15f, t.text);
        head.setGravity(Gravity.CENTER);
        head.setSingleLine(true);
        head.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        head.setPadding(t.dp(18), t.dp(14), t.dp(18), t.dp(10));
        card.addView(head);
        card.addView(t.hairline());

        addItem(card, getString(R.string.hs_menu_workbench), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
                switchTo(entry, false);
            }
        });
        addItem(card, getString(R.string.hs_menu_archive), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
                switchTo(entry, true);
            }
        });
        addItem(card, getString(R.string.hs_menu_rename), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
                renameDialog(entry);
            }
        });
        addItem(card, getString(R.string.hs_menu_delete), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
                deleteDialog(entry);
            }
        });
        addItem(card, getString(R.string.cancel), new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });

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
        Motion.panelIn(card, this);
    }

    private void addItem(LinearLayout card, String label, View.OnClickListener click) {
        TextView item = t.text(label, 15f, t.text);
        item.setGravity(Gravity.CENTER);
        item.setPadding(t.dp(16), t.dp(13), t.dp(16), t.dp(13));
        item.setBackground(t.ripple(8f));
        item.setClickable(true);
        item.setOnClickListener(click);
        card.addView(item, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private void renameDialog(final Hosts.Entry entry) {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(t.dp(18), t.dp(16), t.dp(18), t.dp(16));

        TextView title = t.strong(getString(R.string.hs_rename_title), 16f, t.text);
        card.addView(title);

        final EditText field = field(Hosts.title(entry), getString(R.string.hs_rename_hint), false);
        Theme.margin(field, 0, t.dp(12), 0, 0);
        card.addView(field);

        TextView ok = t.strong(getString(R.string.hs_save), 15f, t.onAccent);
        ok.setGravity(Gravity.CENTER);
        ok.setPadding(0, t.dp(12), 0, t.dp(12));
        ok.setBackground(t.rippleOn(t.accent, 22f));
        Theme.margin(ok, 0, t.dp(16), 0, 0);
        card.addView(ok, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        ok.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                String name = field.getText().toString().trim();
                Hosts.rename(prefs, entry.id, name);
                dialog.dismiss();
                probeAll();
            }
        });

        dialog.setContentView(card);
        sizeDialog(dialog, 320);
        dialog.show();
        Motion.panelIn(card, this);
    }

    private void deleteDialog(final Hosts.Entry entry) {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(t.dp(18), t.dp(16), t.dp(18), t.dp(16));

        TextView title = t.strong(getString(R.string.hs_delete_title), 16f, t.text);
        card.addView(title);
        TextView body = t.text(getString(R.string.hs_delete_body, displayTitle(entry),
                shortAddress(entry.address)), 13f, t.muted);
        Theme.margin(body, 0, t.dp(10), 0, 0);
        card.addView(body);

        LinearLayout actions = t.row();
        Theme.margin(actions, 0, t.dp(18), 0, 0);
        TextView cancel = t.text(getString(R.string.cancel), 15f, t.muted);
        cancel.setGravity(Gravity.CENTER);
        cancel.setPadding(0, t.dp(11), 0, t.dp(11));
        cancel.setBackground(t.rippleOn(t.surfaceAlt, 22f));
        actions.addView(cancel, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView remove = t.text(getString(R.string.delete), 15f, 0xFFFFFFFF);
        remove.setGravity(Gravity.CENTER);
        remove.setPadding(0, t.dp(11), 0, t.dp(11));
        remove.setBackground(t.rippleOn(t.bad, 22f));
        Theme.margin(remove, t.dp(10), 0, 0, 0);
        actions.addView(remove, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        card.addView(actions);

        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });
        remove.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
                Hosts.remove(prefs, entry.id);
                if (prefs.token().length() == 0) {
                    Nav.replace(HostsActivity.this, new Intent(HostsActivity.this, PairActivity.class));
                    return;
                }
                probeAll();
            }
        });

        dialog.setContentView(card);
        sizeDialog(dialog, 320);
        dialog.show();
        Motion.panelIn(card, this);
    }

    /* ================================================================== */
    /* 添加主机                                                           */
    /* ================================================================== */

    private void addDialog() {
        final Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        final LinearLayout card = t.column();
        card.setBackground(t.round(t.surface, 16f));
        card.setPadding(t.dp(18), t.dp(16), t.dp(18), t.dp(16));

        TextView title = t.strong(getString(R.string.hs_add_title), 16f, t.text);
        card.addView(title);
        TextView hint = t.text(getString(R.string.hs_add_hint), 12f, t.muted);
        Theme.margin(hint, 0, t.dp(6), 0, 0);
        card.addView(hint);

        final EditText name = field(prefs.debug("hostName"), getString(R.string.hs_field_name), false);
        final EditText address = field(prefs.debug("hostAddress"), "192.168.x.x:8737", false);
        final EditText pair = field(prefs.debug("hostCode"), getString(R.string.hs_field_code), true);
        Theme.margin(name, 0, t.dp(14), 0, 0);
        Theme.margin(address, 0, t.dp(10), 0, 0);
        Theme.margin(pair, 0, t.dp(10), 0, 0);
        card.addView(name);
        card.addView(address);
        card.addView(pair);

        final TextView error = t.text("", 12f, t.bad);
        Theme.margin(error, 0, t.dp(10), 0, 0);
        card.addView(error);

        final TextView submit = t.strong(getString(R.string.hs_submit), 15f, t.onAccent);
        submit.setGravity(Gravity.CENTER);
        submit.setPadding(0, t.dp(12), 0, t.dp(12));
        submit.setBackground(t.rippleOn(t.accent, 22f));
        Theme.margin(submit, 0, t.dp(14), 0, 0);
        card.addView(submit, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView cancel = t.text(getString(R.string.cancel), 14f, t.muted);
        cancel.setGravity(Gravity.CENTER);
        cancel.setPadding(0, t.dp(12), 0, t.dp(4));
        // 文字按钮（无底色）也要有按压反馈 —— 对应 Material TextButton 的 ripple，与 PairActivity.java:97 同一处理。
        cancel.setBackground(t.ripple(999f));
        card.addView(cancel);
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                dialog.dismiss();
            }
        });

        submit.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                final String host = address.getText().toString().trim();
                String code = pair.getText().toString().trim();
                if (host.length() == 0) {
                    error.setText(getString(R.string.hs_err_address));
                    return;
                }
                if (code.length() != 6) {
                    error.setText(getString(R.string.hs_err_code));
                    return;
                }
                error.setTextColor(t.muted);
                error.setText(getString(R.string.hs_pairing));
                submit.setEnabled(false);
                final String hostName = name.getText().toString().trim();
                final String device = deviceName();
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        String message = "";
                        JSONObject pong = null;
                        try {
                            JSONObject body = new JSONObject();
                            body.put("code", pair.getText().toString().trim());
                            body.put("device", device);
                            JSONObject result = Api.call(host, "", "POST", "/v1/pair", body);
                            String token = result.optString("token", "");
                            if (token.length() == 0) throw new Exception(getString(R.string.hs_err_no_token));
                            Hosts.add(prefs, hostName, host, token, device);
                            pong = Api.call(host, token, "GET", "/v1/ping", null);
                        } catch (Exception problem) {
                            message = Api.message(problem);
                        }
                        final String fail = message;
                        final JSONObject info = pong;
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                submit.setEnabled(true);
                                if (fail.length() > 0) {
                                    error.setTextColor(t.bad);
                                    error.setText(getString(R.string.hs_err_failed, fail));
                                    return;
                                }
                                dialog.dismiss();
                                toast(getString(R.string.hs_added, info == null ? host : (hostName.length() > 0
                                        ? hostName : host)));
                                probeAll();
                            }
                        });
                    }
                }).start();
            }
        });

        dialog.setContentView(card);
        sizeDialog(dialog, 340);
        dialog.show();
        Motion.panelIn(card, this);
    }

    private void sizeDialog(Dialog dialog, int widthDp) {
        Window window = dialog.getWindow();
        if (window == null) return;
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams();
        lp.copyFrom(window.getAttributes());
        lp.width = t.dp(widthDp);
        lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
        window.setAttributes(lp);
    }

    private EditText field(String value, String hint, boolean digits) {
        EditText edit = new EditText(this);
        edit.setText(value == null ? "" : value);
        edit.setHint(hint);
        edit.setHintTextColor(t.muted);
        edit.setTextColor(t.text);
        edit.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14.5f);
        edit.setSingleLine(true);
        edit.setBackground(t.round(t.surfaceAlt, 12f));
        edit.setPadding(t.dp(12), t.dp(11), t.dp(12), t.dp(11));
        if (digits) edit.setInputType(InputType.TYPE_CLASS_NUMBER);
        edit.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return edit;
    }

    private String deviceName() {
        String model = android.os.Build.MODEL == null ? "android" : android.os.Build.MODEL;
        return model + " (Android " + android.os.Build.VERSION.RELEASE + ")";
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }
}
