# Cardano: Rewards tracking ######

fld_data <- "C:/Users/Dafydd/Desktop/"
fld_proj <- "G:/My Drive/Projects/crypto_fun/"

# FUNCTIONS ####
callin_data_fun <- function(fld_data){
  fl <- grep("Rewards",list.files(paste0(fld_data)),value=T)
  df <-do.call(rbind,lapply(fl,function(x) data.frame(nam=x,read.csv(paste0(fld_data,x)))))

  # Remove duplicated data
  df <- df[!duplicated(df[!colnames(df)%in%c("nam","Wallet","Rewards.address")]),]
  df <- do.call(cbind,lapply(split(df,df$Wallet),function(x){rownames(x) <- x$nam;x}))
  df <- df[,-grep('nam',colnames(df))[2]]
  df$time <- gsub(".csv","",gsub("Rewards-","",rownames(df)))
  # df$nam <- do.call(rbind,strsplit(gsub("Rewards-","",rownames(df)),'.',fixed=T))[,1]
  # df$time <- substr(df$nam,0,10)
  dftime <- epoch_time_fun(dfin=df)
  dftime
}

epoch_time_fun <- function(dfin){
  
  # convert time to denver time zone
  tim <- as.Date(dfin$time,tz="America/Denver")
  # 15:45 UTC/GMT | 9:45 MDT
  # 2025-07-08 #569
  # every 5 days
  ## start seq
  # 2025-01-04 9:45, epoch 532
  t_start <- as.POSIXlt("2025-01-04 09:45:00",tz="America/Denver")
  t_today <- as.POSIXlt(paste0(Sys.Date(),' 09:45:00'),tz="America/Denver")
  t_diff <- difftime(t_today,t_start)
  
  
  # Determine breaks for intervals
  c_breaks <- seq(from = as.Date(t_start,tz="America/Denver"), to =  as.Date(t_today,tz="America/Denver")+5, by = 5)
  
  # Cut dates into intervals
  interval_factor <- cut(tim, breaks = as.Date(c_breaks,tz="America/Denver"), right = FALSE)
  indic <- match(interval_factor,c_breaks)  # current epoch 576 start 2025-08-12 ;   531   30-12-2024, 21:45 to  04-01-2025, 21:45
  
  df_time <- data.frame(epoch = 532:(531+length(c_breaks)),e_start=c_breaks)
  df_out <- cbind(dfin[match(1:length(c_breaks),indic),],df_time)
  df_out
}


# Data call ####
dat <- callin_data_fun(fld_data)

# write out results for storage
write.csv(dat,file=paste0("../Desktop/CardanoResults_",tail(dat$epoch[!is.na(dat$time)],1),".csv"))
