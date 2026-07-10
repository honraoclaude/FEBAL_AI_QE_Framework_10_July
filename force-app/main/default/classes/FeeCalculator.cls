public class FeeCalculator {
    public static Decimal calculateTotalFees(List<Id> accountIds) {
        Decimal total = 0;
        for (Id accountId : accountIds) {
            List<Fee__c> fees = [SELECT Amount__c FROM Fee__c WHERE Account__c = :accountId];
            for (Fee__c fee : fees) {
                total += fee.Amount__c;
                fee.Processed__c = true;
                update fee;
            }
        }
        System.debug('total: ' + total);
        return total;
    }

    public static void assignOwner(Id recordId) {
        Fee__c fee = new Fee__c(Id = recordId);
        fee.OwnerId = '005000000000001AAA';
        update fee;
    }
}
