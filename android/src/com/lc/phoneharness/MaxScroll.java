package com.lc.phoneharness;

import android.content.Context;
import android.widget.ScrollView;

/**
 * 有最大高度上限的 ScrollView。
 *
 * 用在「模型反问」面板里：内容少时按内容高度撑开，内容多时到上限就自己滚，
 * 免得问题一多就把聊天流挤没。
 */
public class MaxScroll extends ScrollView {

    private final int maxHeight;

    public MaxScroll(Context context, int maxHeight) {
        super(context);
        this.maxHeight = maxHeight;
        setVerticalScrollBarEnabled(false);
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int capped = MeasureSpec.makeMeasureSpec(maxHeight, MeasureSpec.AT_MOST);
        super.onMeasure(widthSpec, capped);
    }
}
