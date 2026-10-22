package com.ecojust.cleanyourtv;

import android.view.View;
import androidx.recyclerview.widget.RecyclerView;

/** Focus an adapter position after its holder has actually attached, including a cold launch. */
final class CardFocus {
    private CardFocus() { }

    static void request(RecyclerView grid, int position) {
        if (grid.getAdapter() == null || grid.getAdapter().getItemCount() == 0) return;
        int target = Math.max(0, Math.min(position, grid.getAdapter().getItemCount() - 1));
        RecyclerView.ViewHolder holder = grid.findViewHolderForAdapterPosition(target);
        if (holder != null) {
            holder.itemView.findViewById(R.id.card).requestFocus();
            return;
        }
        RecyclerView.OnChildAttachStateChangeListener listener = new RecyclerView.OnChildAttachStateChangeListener() {
            @Override public void onChildViewAttachedToWindow(View view) {
                if (grid.getChildAdapterPosition(view) != target) return;
                grid.removeOnChildAttachStateChangeListener(this);
                view.post(() -> view.findViewById(R.id.card).requestFocus());
            }
            @Override public void onChildViewDetachedFromWindow(View view) { }
        };
        grid.addOnChildAttachStateChangeListener(listener);
        grid.scrollToPosition(target);
    }
}
