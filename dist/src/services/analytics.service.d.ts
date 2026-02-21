export interface Last30DaysPoint {
    date: string;
    product_views: number;
    profile_views: number;
}
export interface TopProduct {
    id: string;
    nombre: string;
    total_views: number;
}
export interface SellerAnalyticsData {
    totalProductViews: number;
    totalProfileViews: number;
    topProducts: TopProduct[];
    last30Days: Last30DaysPoint[];
}
export declare function getSellerAnalyticsData(sellerId: number): Promise<SellerAnalyticsData>;
