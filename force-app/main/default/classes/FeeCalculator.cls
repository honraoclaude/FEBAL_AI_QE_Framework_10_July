public with sharing class FeeCalculator {
    public static Decimal calculateTotalFees(List<Id> accountIds) {
        Decimal total = 0;
        List<Fee__c> fees = [SELECT Amount__c FROM Fee__c WHERE Account__c IN :accountIds];
        List<Fee__c> toUpdate = new List<Fee__c>();
        for (Fee__c fee : fees) {
            total += fee.Amount__c;
            fee.Processed__c = true;
            toUpdate.add(fee);
        }
        update toUpdate;
        return total;
    }

    public static void assignOwner(Id recordId) {
        update new Fee__c(Id = recordId, OwnerId = UserInfo.getUserId());
    }
}
