# BTC vs GBTC fun

#files
#libraries ####
lapply(c('jsonlite','glue','ggplot2','tidyverse','timeDate'), require, character.only = TRUE)
lapply(c("googlesheets4","googledrive"), require, character.only = TRUE)
#fixing variables ####
if(tolower(Sys.info()['sysname'])=='windows'){
  fldr_g <- "C:/Users/Dafydd/Google Drive/Projects/crypto_fun/"
}else fldr_g <- "/Users/dydd/Google Drive/Projects/crypto_fun/"

# FUNCTIONS ####
# create a function to retrieve daily data
retreive_daily_data <- function(pair, filename) {
  url = glue("https://api.pro.coinbase.com/products/{pair}/candles?granularity=86400")
  # url = glue("https://api.pro.coinbase.com/products/{pair}/candles?granularity=720")
  columnNames <- c('unix', 'low', 'high', 'open', 'close', glue('{pair} volume'))
  mydata <- fromJSON(url)
  df <- as.data.frame(mydata)
  colnames(df) <- columnNames  # rename the columns
  write.csv(df, file = filename)
  # Unix Timestamp - This is the unix timestamp or also known as "Epoch Time". Use this to convert to your local timezone
  # Date - This timestamp is converted to NY EST Standard Time
  # Symbol - The symbol for which the timeseries data refers
  # Open - This is the opening price of the time period
  # High - This is the highest price of the time period
  # Low - This is the lowest price of the time period
  # Close - This is the closing price of the time period
  # Volume (Crypto) - This is the volume in the transacted Ccy. Ie. For BTC/USD, this is in BTC amount
  # Volume Base Ccy - This is the volume in the base/converted ccy. Ie. For BTC/USD, this is in USD amount
  df
}
# pull in all data 
callMerge_data <- function(token='CB_BTC_USD',exch='CoinBase'){
  # BTC
  # c('GBTC','OTC','CB_BTC_USD','CoinBase')
  lst_token <- grep(token,list.files(fldr_g),value=T)
  df_token <- do.call(rbind,lapply(lst_token,function(x){
    out <- read.csv(paste0(fldr_g,x))
    colnames(out)<- tolower(colnames(out))
    colnames(out)[grep('volume',colnames(out))] <- "volume"
    colnames(out)[grep('date',colnames(out))] <- "unix"
    out[,c("unix","low","high","open","close","volume")]
    }))
  df_token <- tibble::as_tibble(df_token[!duplicated(df_token$unix),])
  df_token$date <- as.POSIXct(df_token$unix, origin="1970-01-01")
  df_token$date <- as.Date(df_token$date)
  df_token <- df_token[order(df_token$date),]
  df_token <- df_token[,!colnames(df_token) %in%'unix']
  df_token$exch <- exch
  return(df_token)
}

 # manual GBTC work ####
# GBTC historic data
# # https://finance.yahoo.com/quote/GBTC/history?p=GBTC
# # https://finance.yahoo.com/quote/ETHE/history?p=ETHE
# lst_gbtc <- grep('GBTC_',list.files(fldr_g),value=T)
# gbtcl <- do.call(rbind,lapply(lst_gbtc,function(x) read.csv(paste0(fldr_g,x))))
# gbtc <- as_tibble(gbtcl[!duplicated(gbtcl$Date),])
# # gbtc1 <- read.csv("~/../Downloads/GBTC (1).csv")
# # gbtc2 <- read.csv("~/../Downloads/GBTC (2).csv")
# # gbtc <- as_tibble(rbind(gbtc1,gbtc2[!gbtc2$Date %in% gbtc1$Date,]))
# gbtc$Date <- as.Date(gbtc$Date); gbtc <- gbtc[order(gbtc$Date),]

# #https://www.cryptodatadownload.com/index.html
# #Coinbase #####
# #import the libraries we need
# lst_btc_cb <- grep('CB_BTC_USD',list.files(fldr_g),value=T)
# cb_btcl <- do.call(rbind,lapply(lst_btc_cb,function(x) read.csv(paste0(fldr_g,x))[!grep("X",colnames(read.csv(paste0(fldr_g,x))))]))
# cb_btc <- as_tibble(gbtcl[!duplicated(gbtcl$Date),])




# Update Coinbase data #
# newPair <- "BTC-USD"
# fileName <- glue("dailyData{newPair}_{Sys.Date()}.csv")
# runFunc <- retreive_daily_data(newPair, filename = paste0(fldr_g,fileName))

newPairs <- c("BTC-USD","ETH-USD","ADA-USD")
runFuncs <- lapply(newPairs,function(np){
  fileName <- glue("CB_{np}_{Sys.Date()}.csv")
  out <- retreive_daily_data(np, filename = paste0(fldr_g,fileName))
  out$date <- as.POSIXct(out$unix, origin="1970-01-01")
  out$exch <- 'CoinBase'
  out$coin <- np
  if(tolower(Sys.info()['sysname'])=='windows'){
    fldr_out <- "~/../Downloads/CB_"
  } else fldr_out <- paste0(fldr_g,"/CB_")
  write.csv(out,file = paste0(fldr_out,gsub("-","_",np),'_',Sys.Date(),'.csv'))
  return(out)
  });names(runFuncs) <- newPairs





# call data in 
# BTC
df_btc <- apply(matrix(c('GBTC','OTC','CB_BTC_USD','CoinBase'),byrow = T,ncol=2),1,function(x){
  print(x)
  callMerge_data(x[1],x[2])
})
# df_btc <- apply(matrix(c('CB_BTC_USD','CoinBase'),byrow = T,ncol=2),1,function(x){
#   print(x)
#   callMerge_data(x[1],x[2])
# })

dfbtc <- do.call(rbind,df_btc)
date_uni <- sort(unique(dfbtc$date))
dfbtc2 <- cbind(df_btc[[1]][match(date_uni,df_btc[[1]]$date),],df_btc[[2]][match(date_uni,df_btc[[2]]$date),])
dfbtc2 <- dfbtc2[,c(1:6,8:12)]

# ETH
df_eth <- apply(matrix(c('ETHE','OTC','CB_ETH_USD','CoinBase'),byrow = T,ncol=2),1,function(x){
  print(x)
  callMerge_data(x[1],x[2])
})
dfeth <- do.call(rbind,df_eth)
date_uniETH <- sort(unique(dfeth$date))
dfeth2 <- rbind(df_eth[[1]][match(date_uniETH,df_eth[[1]]$date),],df_eth[[2]][match(date_uniETH,df_eth[[2]]$date),])
dfeth2$date <- rep(date_uniETH,length(df_eth))
# dfeth2 <- dfeth2[,c(1:6,8:12)]

#plotting
# colnames(gbtc) <- tolower(colnames(gbtc))
# gbtc$exch <- 'GBTC'
# btc_cb$exch <- 'CoinBase'
# if(tolower(Sys.info()['sysname'])=='windows'){
#   file_btcout <- paste0('~/../Downloads/CB_BTC_',Sys.Date(),'.csv')
# } else file_btcout <- paste0(fldr_g,"/CD_BTC_',Sys.Date(),'.csv")
# write.csv(btc_cb,file = file_btcout)
# #use Oct 1 price
# gbtc_2 <- gbtc
# # btc_cb$perc <- btc_cb$close/btc_cb$close[which(btc_cb$date=="2020-10-02 18:00:00 MDT")]
date_zero <- "2021-01-14 18:00:00 MDT"
if(weekdays(as.Date(date_zero)) %in%c("Saturday","Sunday")){
  if(weekdays(as.Date(date_zero))=="Saturday"){
    date_zero1 <- as.Date(date_zero)-1
  }else date_zero1 <- as.Date(date_zero)-2
} else date_zero1 <- as.Date(date_zero)
date_zero2 <-format(as.Date(date_zero1),'%y-%m-%d')
date_zeroAnno <- (as.Date(date_zero1) - 14)
btc_cb$date <- format(as.Date(btc_cb$date),"%y-%m-%d")
btc_cb$perc <- btc_cb$close/btc_cb$close[which(btc_cb$date==date_zero2)]
gbtc_2$date <- format(as.POSIXct(gbtc_2$date),"%y-%m-%d");gbtc_2 <- gbtc_2[order(as.Date(gbtc_2$date)),]
gbtc_2$perc <- gbtc_2$close/gbtc_2$close[which(gbtc_2$date==date_zero2)]

dfin <- rbind(btc_cb[,c('exch','date','perc')],gbtc_2[,c('exch','date','perc')])
dfin$date <- as.Date(dfin$date,format = "%y-%m-%d")
perc_gain_day <- ggplot(dfin,aes(x=date,y=perc,color=exch))+geom_point()+geom_line()+theme_bw()+
  geom_vline(xintercept=as.Date(date_zero1))+annotate('text',x=(date_zeroAnno),y = 2.5,label='Refernce price',angle=0)+
  annotate('text',x=as.Date(date_zero1),y = 2.2,label=paste0('GBTC: ',round(gbtc_2$close[which(gbtc_2$date==date_zero2)],2),',  CB: ',round(btc_cb$close[which(btc_cb$date==date_zero2)],2)),angle=0)+
  labs(x="Date",y='Fold change',title='(G)BTC-USD change (last 300 days)\n GBTC vs CoinBase BTC')

df_diff <- merge(btc_cb,gbtc_2,by='date')
df_diff$date<-as.Date(df_diff$date,format = "%y-%m-%d")
# perc_dif_day <- 
  ggplot(df_diff,aes(x=date,y=(perc.x-perc.y)))+geom_point()+geom_line()+theme_bw()+
  geom_vline(xintercept=as.Date(date_zero1))+
    stat_smooth(method = 'lm')+ggpubr::stat_regline_equation()+
    # annotate('text',x=(date_zeroAnno),y = 2.5,label='Refernce price',angle=0)+
  # annotate('text',x=as.Date(date_zero1),y = 2.2,label=paste0('GBTC: ',round(gbtc_2$close[which(gbtc_2$date==date_zero2)],2),',  CB: ',round(btc_cb$close[which(btc_cb$date==date_zero2)],2)),angle=0)+
  labs(x="Date",y='% diff',title='(G)BTC-USD change (last +300 days)\n (CoinBase BTC - GBTC)')

ggsave(perc_gain_day,filename = '~/../Desktop/(G)BTC_vs_USD.png',height = 4, width = 8)

btc_cb3 <- gbtc_2[match(btc_cb$date,gbtc_2$date),]
ratin <- as_tibble(data.frame(date=as.Date(btc_cb$date, format='%y-%m-%d',origin="1970-01-01"),ratio=as.numeric(btc_cb$open/btc_cb3$open)))
ratin$wday <- format(ratin$date,'%a'); ratin$holdy <- ratin$date%in%as.Date(holidayLONDON())
ggplot(ratin,aes(x=date,y=ratio))+geom_point()+geom_line()+theme_bw()+
  #geom_vline(xintercept=as.Date("2020-10-01"))+annotate('text',x=as.Date("2020-09-21"),y = 3,label='Refernce price',angle=90)+
  #annotate('text',x=as.Date("2020-10-11"),y = 3,label=paste0('GBTC: ',gbtc2$close[which(gbtc2$date=="2020-10-01")],',  CB: ',btc_cb$close[which(btc_cb$date=="2020-10-01")]),angle=90)+
  labs(x="Date",y='BTC/GBTC',title='Ratio:CoinBase BTC/GBTC\n(last 300 days)')

tmp <- glm(data=ratin,formula = "ratio ~ wday+holdy")


dtw(btc_cb$open,btc_cb3$open)
alignmentOBE <-
  dtw(btc_cb$perc[gbtc_2$date%in%btc_cb$date],
      gbtc_2$perc[btc_cb$date%in%gbtc_2$date],
      keep=TRUE,step=asymmetric,
      open.end=TRUE,open.begin=TRUE)
plot(alignmentOBE,type="two",off=1)






ggplot(df_btc,aes(x=date,y=volume,color=exch))+geom_point()+geom_line()+theme_classic()
dfbtc2$rat_vol <- dfbtc2[,5]/dfbtc2[,11]
ggplot(dfbtc2,aes(x=date,y=rat_vol))+geom_point()+geom_line()+theme_classic()+
  scale_y_log10()



# ETH vs BTC
dfbtcCB <- dfbtc[which(dfbtc$exch=='CoinBase'),]
dfethCB <- dfeth[which(dfeth$exch=='CoinBase'),]
tim_BE <- sort(unique(c(dfbtcCB$date,dfethCB$date)))

dfbtcCB2<-dfbtcCB[match(tim_BE,dfbtcCB$date),]
dfETHCB2<-dfethCB[match(tim_BE,dfethCB$date),]
be <- data.frame(date=tim_BE,rat=dfbtcCB2$open/dfETHCB2$open)
ggeb<- ggplot(be,aes(x=date,y=rat))+geom_point()

ggplotly(ggeb)
