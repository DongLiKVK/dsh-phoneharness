package com.lc.phoneharness;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

/**
 * 会换行的行容器（没有 Flexbox 依赖，自己按宽度折行）。
 *
 * 用在「模型反问」的选项上：选项少时一行排开，选项多或文字长时自动换行，
 * 避免每个选项都独占一整行、把卡片撑得老高。
 */
public class Flow extends ViewGroup {

    private final int gapX;
    private final int gapY;

    public Flow(Context context, int gapX, int gapY) {
        super(context);
        this.gapX = gapX;
        this.gapY = gapY;
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int width = View.MeasureSpec.getSize(widthSpec);
        int limit = View.MeasureSpec.getMode(widthSpec) == View.MeasureSpec.UNSPECIFIED
                ? Integer.MAX_VALUE : width;
        int lineWidth = 0;
        int lineHeight = 0;
        int totalHeight = 0;
        int widest = 0;
        for (int index = 0; index < getChildCount(); index++) {
            View child = getChildAt(index);
            if (child.getVisibility() == GONE) continue;
            measureChild(child, widthSpec, heightSpec);
            int childWidth = child.getMeasuredWidth();
            int childHeight = child.getMeasuredHeight();
            if (lineWidth > 0 && lineWidth + gapX + childWidth > limit) {
                widest = Math.max(widest, lineWidth);
                totalHeight += lineHeight + gapY;
                lineWidth = 0;
                lineHeight = 0;
            }
            lineWidth += (lineWidth == 0 ? 0 : gapX) + childWidth;
            lineHeight = Math.max(lineHeight, childHeight);
        }
        widest = Math.max(widest, lineWidth);
        totalHeight += lineHeight;
        setMeasuredDimension(
                View.MeasureSpec.getMode(widthSpec) == View.MeasureSpec.UNSPECIFIED ? widest : width,
                totalHeight);
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        int width = right - left;
        int x = 0;
        int y = 0;
        int lineHeight = 0;
        for (int index = 0; index < getChildCount(); index++) {
            View child = getChildAt(index);
            if (child.getVisibility() == GONE) continue;
            int childWidth = child.getMeasuredWidth();
            int childHeight = child.getMeasuredHeight();
            if (x > 0 && x + gapX + childWidth > width) {
                x = 0;
                y += lineHeight + gapY;
                lineHeight = 0;
            }
            if (x > 0) x += gapX;
            child.layout(x, y, x + childWidth, y + childHeight);
            x += childWidth;
            lineHeight = Math.max(lineHeight, childHeight);
        }
    }
}
